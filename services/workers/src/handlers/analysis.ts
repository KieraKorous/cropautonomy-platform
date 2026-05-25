// scan.analysis.requested handler.
//
// Pipeline (matches docs/architecture/capture-pipeline.md § 4):
//   1. Load capture + analysis_job + production model_version for the task.
//   2. Transition job -> running, capture -> analysis_running; publish scan.started.
//   3. Download the original from Supabase Storage.
//   4. POST /v1/inference to services/vision.
//   5. Write analysis_results rows (one per detection).
//   6. Publish scan.detection events as results land; publish scan.completed at end.
//   7. Update capture.inferred_species + inferred_crop_type_id from the top detection.
//   8. Transition job -> succeeded, capture -> analyzed; stamp pipeline_version.
//
// Failure semantics:
//   - VisionNotConfiguredError or VisionUpstreamError -> mark job failed but
//     retryable; pg-boss will retry per its retry policy.
//   - VisionBadRequestError, schema errors, missing storage objects -> failed,
//     not retryable (logic bug; needs human attention).
//   - Realtime publish failures are logged but do not fail the job — the
//     durable record is the DB rows, the realtime events are live feedback.

import type PgBoss from "pg-boss";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@gaia/db/server";
import { publish } from "@gaia/realtime/server";
import { channels } from "@gaia/realtime";
import type { WorkerConfig } from "../config.js";
import type { ScanAnalysisRequested } from "../queues.js";
import { scanAnalysisRequestedSchema } from "../queues.js";
import {
  VisionBadRequestError,
  VisionClient,
  VisionNotConfiguredError,
  VisionUpstreamError,
  type VisionDetection
} from "../lib/vision-client.js";

// The generated Database type narrows table writes to `never` until
// `pnpm --filter @gaia/db types:generate` runs against a live stack.
// Same workaround as services/api/src/lib/db.ts.
function getDb(): SupabaseClient {
  return getServerSupabase() as unknown as SupabaseClient;
}

interface CaptureRow {
  id: string;
  org_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  status: string;
}

interface AnalysisJobRow {
  id: string;
  org_id: string;
  capture_id: string;
  status: string;
}

interface ModelVersionRow {
  id: string;
  name: string;
  version: string;
  task: string;
  status: string;
}

export function makeAnalysisHandler(config: WorkerConfig) {
  const vision = new VisionClient({
    baseUrl: config.VISION_SERVICE_URL,
    timeoutMs: config.VISION_REQUEST_TIMEOUT_MS
  });

  return async function handleAnalysisJob(jobs: PgBoss.Job<ScanAnalysisRequested>[]) {
    for (const job of jobs) {
      const payload = scanAnalysisRequestedSchema.parse(job.data);
      await runOne(payload, vision, config);
    }
  };
}

async function runOne(
  payload: ScanAnalysisRequested,
  vision: VisionClient,
  config: WorkerConfig
): Promise<void> {
  const supabase = getDb();

  // 1. Load capture, analysis_job, and chosen model_version.
  const { data: captureData, error: captureErr } = await supabase
    .from("captures")
    .select("id, org_id, storage_bucket, storage_path, mime_type, status")
    .eq("id", payload.captureId)
    .maybeSingle();
  if (captureErr) throw captureErr;
  if (!captureData) throw new Error(`capture ${payload.captureId} not found`);
  const capture = captureData as unknown as CaptureRow;

  const { data: jobData, error: jobErr } = await supabase
    .from("analysis_jobs")
    .select("id, org_id, capture_id, status")
    .eq("id", payload.analysisJobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!jobData) throw new Error(`analysis_job ${payload.analysisJobId} not found`);
  const analysisJob = jobData as unknown as AnalysisJobRow;

  if (analysisJob.status !== "queued") {
    // Idempotency: someone else already picked this up (or it already ran).
    // Log + skip rather than double-process.
    // eslint-disable-next-line no-console
    console.warn(
      `analysis_job ${analysisJob.id} status is '${analysisJob.status}', skipping`
    );
    return;
  }

  const model = await resolveModel(payload, supabase);
  if (!model) {
    await failJob(
      analysisJob.id,
      capture.id,
      `no production model_version for task '${payload.task}'`,
      "no_model_available",
      false
    );
    return;
  }

  const pipelineVersion = `${model.name}@${model.version}`;

  // 2. Mark running + publish scan.started.
  const nowIso = new Date().toISOString();
  const { error: jobStartErr } = await supabase
    .from("analysis_jobs")
    .update({
      status: "running",
      started_at: nowIso,
      pipeline_version: pipelineVersion
    })
    .eq("id", analysisJob.id);
  if (jobStartErr) throw jobStartErr;

  const { error: captureRunningErr } = await supabase
    .from("captures")
    .update({ status: "analysis_running", status_message: null })
    .eq("id", capture.id);
  if (captureRunningErr) throw captureRunningErr;

  await safePublish(channels.scanProgress(capture.org_id, analysisJob.id), {
    type: "scan.started",
    version: 1,
    payload: {
      scanId: analysisJob.id,
      captureId: capture.id,
      startedAt: nowIso
    }
  });

  // 3. Download the original from Storage.
  let imageBytes: Uint8Array;
  try {
    imageBytes = await downloadCaptureBinary(
      supabase,
      capture.storage_bucket,
      capture.storage_path
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await failJob(
      analysisJob.id,
      capture.id,
      `storage download failed: ${reason}`,
      "storage_download_failed",
      false
    );
    await safePublishFailure(capture.org_id, analysisJob.id, reason, false);
    return;
  }

  // 4. Call services/vision.
  let inference;
  try {
    inference = await vision.infer(
      {
        captureId: capture.id,
        modelName: model.name,
        modelVersion: model.version,
        task: payload.task,
        maxResults: 10
      },
      { bytes: imageBytes, mimeType: capture.mime_type }
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const retryable =
      err instanceof VisionNotConfiguredError || err instanceof VisionUpstreamError;
    const code =
      err instanceof VisionNotConfiguredError
        ? "vision_not_configured"
        : err instanceof VisionUpstreamError
          ? "vision_upstream_error"
          : err instanceof VisionBadRequestError
            ? "vision_bad_request"
            : "vision_unknown_error";
    await failJob(analysisJob.id, capture.id, reason, code, retryable);
    await safePublishFailure(capture.org_id, analysisJob.id, reason, retryable);
    if (retryable) throw err; // let pg-boss retry
    return;
  }

  // 5. Write analysis_results rows.
  const resultRows = inference.detections.map((d: VisionDetection) => ({
    org_id: capture.org_id,
    analysis_job_id: analysisJob.id,
    capture_id: capture.id,
    category: d.category,
    subcategory: d.subcategory,
    confidence: d.confidence,
    bounding_box: d.bounding_box,
    payload: d.payload
  }));

  let insertedResults: Array<{ id: string }> = [];
  if (resultRows.length > 0) {
    const { data: inserted, error: resultsErr } = await supabase
      .from("analysis_results")
      .insert(resultRows)
      .select("id, category, confidence, bounding_box");
    if (resultsErr) throw resultsErr;
    insertedResults = (inserted ?? []) as Array<{ id: string }>;
  }

  // 6. Publish a scan.detection event per result (live feedback).
  for (let i = 0; i < insertedResults.length; i++) {
    const result = insertedResults[i] as {
      id: string;
      category: string;
      confidence: number;
    };
    await safePublish(channels.scanDetection(capture.org_id, analysisJob.id), {
      type: "scan.detection",
      version: 1,
      payload: {
        scanId: analysisJob.id,
        detectionId: result.id,
        category: result.category,
        confidence: result.confidence
      }
    });
  }

  // 7. Stamp capture-level inferred classification from the top detection.
  if (inference.detections.length > 0) {
    const top = inference.detections.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
    await supabase
      .from("captures")
      .update({ inferred_species: top.category })
      .eq("id", capture.id);
  }

  // 8. Mark complete and publish scan.completed.
  const completedIso = new Date().toISOString();
  await supabase
    .from("analysis_jobs")
    .update({
      status: "succeeded",
      completed_at: completedIso,
      pipeline_version: pipelineVersion,
      metadata: { provider: inference.provider_metadata }
    })
    .eq("id", analysisJob.id);

  await supabase
    .from("captures")
    .update({ status: "analyzed" })
    .eq("id", capture.id);

  await safePublish(channels.scanProgress(capture.org_id, analysisJob.id), {
    type: "scan.completed",
    version: 1,
    payload: {
      scanId: analysisJob.id,
      completedAt: completedIso,
      detectionCount: insertedResults.length,
      durationMs: inference.duration_ms
    }
  });
}

async function resolveModel(
  payload: ScanAnalysisRequested,
  supabase: SupabaseClient
): Promise<ModelVersionRow | null> {
  if (payload.modelName && payload.modelVersion) {
    const { data, error } = await supabase
      .from("model_versions")
      .select("id, name, version, task, status")
      .eq("name", payload.modelName)
      .eq("version", payload.modelVersion)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as ModelVersionRow) ?? null;
  }

  // Pick the production model for the task. If there's no production yet
  // (initial v0 state), fall back to the highest-status shadow model so the
  // pipeline runs end-to-end before promotion happens.
  const { data: prod, error: prodErr } = await supabase
    .from("model_versions")
    .select("id, name, version, task, status")
    .eq("task", payload.task)
    .eq("status", "production")
    .maybeSingle();
  if (prodErr) throw prodErr;
  if (prod) return prod as unknown as ModelVersionRow;

  const { data: shadow, error: shadowErr } = await supabase
    .from("model_versions")
    .select("id, name, version, task, status")
    .eq("task", payload.task)
    .eq("status", "shadow")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shadowErr) throw shadowErr;
  return (shadow as unknown as ModelVersionRow) ?? null;
}

async function downloadCaptureBinary(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  if (!data) throw new Error("storage download returned no data");
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

async function failJob(
  jobId: string,
  captureId: string,
  message: string,
  code: string,
  retryable: boolean
): Promise<void> {
  const supabase = getDb();
  const now = new Date().toISOString();
  // Retryable failures stay 'running' so pg-boss retries don't see a terminal
  // state; non-retryable failures become 'failed' with the error stamped.
  if (retryable) {
    await supabase
      .from("analysis_jobs")
      .update({ error: message, error_code: code })
      .eq("id", jobId);
    await supabase
      .from("captures")
      .update({ status_message: message })
      .eq("id", captureId);
    return;
  }
  await supabase
    .from("analysis_jobs")
    .update({
      status: "failed",
      error: message,
      error_code: code,
      completed_at: now
    })
    .eq("id", jobId);
  await supabase
    .from("captures")
    .update({ status: "failed", status_message: message })
    .eq("id", captureId);
}

async function safePublish(
  channel: string,
  event: Parameters<typeof publish>[1]
): Promise<void> {
  try {
    await publish(channel, event);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `realtime publish failed on ${channel}: ${err instanceof Error ? err.message : err}`
    );
  }
}

async function safePublishFailure(
  orgId: string,
  scanId: string,
  reason: string,
  retryable: boolean
): Promise<void> {
  await safePublish(channels.scanProgress(orgId, scanId), {
    type: "scan.failed",
    version: 1,
    payload: {
      scanId,
      failedAt: new Date().toISOString(),
      error: reason,
      retryable
    }
  });
}
