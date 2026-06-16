// scan.analysis.requested handler.
//
// Pipeline (matches docs/architecture/capture-pipeline.md § 4 and the
// pipeline architecture memory project-pipeline-architecture):
//   1. Load capture + analysis_job.
//   2. Resolve the production pipeline for the requested task, expand to
//      a StageSpec list joined against model_versions.
//   3. Transition job -> running with pipeline_id + pipeline_version stamped;
//      capture -> analysis_running; publish scan.started.
//   4. Download the original from Supabase Storage.
//   5. POST /v1/inference to services/vision with the full pipeline spec.
//   6. Write analysis_results rows (one per detection) including provenance.
//   7. Publish scan.detection events as results land; publish scan.completed
//      at end.
//   8. Update capture.inferred_species from the top detection.
//   9. Transition job -> succeeded with per-stage reports in metadata,
//      capture -> analyzed.
//
// Failure semantics:
//   - VisionNotConfiguredError or VisionUpstreamError -> mark job failed but
//     retryable; pg-boss will retry per its retry policy.
//   - VisionBadRequestError, schema errors, missing storage objects,
//     no-production-pipeline -> failed, not retryable.
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
  type StageRole,
  type VisionDetection,
  type VisionPipelineSpec,
  type VisionStageReport,
  type VisionStageSpec
} from "../lib/vision-client.js";

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

interface PipelineRow {
  id: string;
  name: string;
  version: string;
  task: string;
  status: string;
}

interface PipelineStageRow {
  id: string;
  stage_order: number;
  role: StageRole;
  config: Record<string, unknown> | null;
  enabled: boolean;
  required: boolean;
  model_version: {
    name: string;
    version: string;
  };
}

// The generated Database type narrows table writes to `never` until
// `pnpm --filter @gaia/db types:generate` runs against a live stack.
// Same workaround as services/api/src/lib/db.ts.
function getDb(): SupabaseClient {
  return getServerSupabase() as unknown as SupabaseClient;
}

export function makeAnalysisHandler(config: WorkerConfig) {
  const vision = new VisionClient({
    baseUrl: config.VISION_SERVICE_URL,
    timeoutMs: config.VISION_REQUEST_TIMEOUT_MS
  });

  return async function handleAnalysisJob(jobs: PgBoss.Job<ScanAnalysisRequested>[]) {
    for (const job of jobs) {
      const payload = scanAnalysisRequestedSchema.parse(job.data);
      await runOne(payload, vision);
    }
  };
}

async function runOne(
  payload: ScanAnalysisRequested,
  vision: VisionClient
): Promise<void> {
  const supabase = getDb();

  // 1. Load capture + analysis_job.
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
    // Idempotency: someone else already picked this up. Skip rather than
    // double-process.
    // eslint-disable-next-line no-console
    console.warn(
      `analysis_job ${analysisJob.id} status is '${analysisJob.status}', skipping`
    );
    return;
  }

  // 2. Resolve the production pipeline for this task.
  const pipeline = await resolvePipeline(payload, supabase);
  if (!pipeline) {
    await failJob(
      supabase,
      analysisJob.id,
      capture.id,
      `no production pipeline for task '${payload.task}'`,
      "no_pipeline_available",
      false
    );
    return;
  }
  const stages = await loadStages(pipeline.row.id, supabase);
  if (stages.length === 0) {
    await failJob(
      supabase,
      analysisJob.id,
      capture.id,
      `pipeline ${pipeline.row.name}@${pipeline.row.version} has no stages`,
      "pipeline_empty",
      false
    );
    return;
  }

  const pipelineSpec: VisionPipelineSpec = {
    name: pipeline.row.name,
    version: pipeline.row.version,
    stages: stages.map(toStageSpec)
  };
  const pipelineKey = `${pipeline.row.name}@${pipeline.row.version}`;

  // 3. Mark running + publish scan.started.
  const nowIso = new Date().toISOString();
  const { error: jobStartErr } = await supabase
    .from("analysis_jobs")
    .update({
      status: "running",
      started_at: nowIso,
      pipeline_id: pipeline.row.id,
      pipeline_version: pipelineKey
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

  // 4. Download the original from Storage.
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
      supabase,
      analysisJob.id,
      capture.id,
      `storage download failed: ${reason}`,
      "storage_download_failed",
      false
    );
    await safePublishFailure(capture.org_id, analysisJob.id, reason, false);
    return;
  }

  // 5. Call services/vision with the resolved pipeline.
  let inference;
  try {
    inference = await vision.infer(
      {
        captureId: capture.id,
        task: payload.task,
        pipeline: pipelineSpec
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
    await failJob(supabase, analysisJob.id, capture.id, reason, code, retryable);
    await safePublishFailure(capture.org_id, analysisJob.id, reason, retryable);
    if (retryable) throw err; // let pg-boss retry
    return;
  }

  // 6. Write analysis_results rows — one per detection, with provenance.
  const resultRows = inference.detections.map((d: VisionDetection) => ({
    org_id: capture.org_id,
    analysis_job_id: analysisJob.id,
    capture_id: capture.id,
    category: d.category ?? "unknown",
    subcategory: d.subcategory,
    confidence: d.confidence,
    bounding_box: d.bounding_box,
    payload: d.payload,
    provenance: d.provenance
  }));

  let insertedResults: Array<{ id: string; category: string; confidence: number }> = [];
  if (resultRows.length > 0) {
    const { data: inserted, error: resultsErr } = await supabase
      .from("analysis_results")
      .insert(resultRows)
      .select("id, category, confidence");
    if (resultsErr) throw resultsErr;
    insertedResults =
      (inserted as Array<{ id: string; category: string; confidence: number }>) ?? [];
  }

  // 7. Publish a scan.detection event per result.
  for (const result of insertedResults) {
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

  // 8. Stamp capture-level inferred fields from the pipeline output: the top
  //    detection's species, plus the agronomic summary + best-effort
  //    observation_type / severity (if the optional summary stage produced
  //    them). All model-authored — captures are not hand-annotated.
  const captureUpdate: {
    inferred_species?: string;
    inferred_common_name?: string;
    inferred_summary?: string;
    inferred_details?: string;
    observation_type?: string;
    severity?: string;
  } = {};
  if (inference.detections.length > 0) {
    const top = inference.detections.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
    if (top.category) captureUpdate.inferred_species = top.category;
    // Common name rides in the detection payload (PlantNet's commonNames). Take
    // the first from the SAME top detection so scientific + common always
    // describe the same organism; null when the top isn't a species detection.
    const commonNames = top.payload?.common_names;
    if (Array.isArray(commonNames) && typeof commonNames[0] === "string") {
      const first = commonNames[0].trim();
      if (first) captureUpdate.inferred_common_name = first;
    }
  }
  if (inference.summary) captureUpdate.inferred_summary = inference.summary;
  if (inference.details) captureUpdate.inferred_details = inference.details;
  if (inference.observation_type) {
    captureUpdate.observation_type = inference.observation_type;
  }
  if (inference.severity) captureUpdate.severity = inference.severity;
  if (Object.keys(captureUpdate).length > 0) {
    await supabase.from("captures").update(captureUpdate).eq("id", capture.id);
  }

  // 9. Mark complete; record per-stage telemetry in analysis_jobs.metadata.
  const completedIso = new Date().toISOString();
  await supabase
    .from("analysis_jobs")
    .update({
      status: "succeeded",
      completed_at: completedIso,
      metadata: {
        stage_reports: inference.stage_reports.map(toReportSummary),
        total_duration_ms: inference.duration_ms
      }
    })
    .eq("id", analysisJob.id);

  await supabase.from("captures").update({ status: "analyzed" }).eq("id", capture.id);

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

async function resolvePipeline(
  payload: ScanAnalysisRequested,
  supabase: SupabaseClient
): Promise<{ row: PipelineRow } | null> {
  // Explicit override: caller named a specific pipeline.
  if (payload.pipelineName && payload.pipelineVersion) {
    const { data, error } = await supabase
      .from("pipelines")
      .select("id, name, version, task, status")
      .eq("name", payload.pipelineName)
      .eq("version", payload.pipelineVersion)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { row: data as unknown as PipelineRow };
  }

  // Default: production pipeline for this task.
  const { data: prod, error: prodErr } = await supabase
    .from("pipelines")
    .select("id, name, version, task, status")
    .eq("task", payload.task)
    .eq("status", "production")
    .maybeSingle();
  if (prodErr) throw prodErr;
  if (prod) return { row: prod as unknown as PipelineRow };

  // Fallback: most recent shadow pipeline. Useful during early v0 before
  // anything has been promoted.
  const { data: shadow, error: shadowErr } = await supabase
    .from("pipelines")
    .select("id, name, version, task, status")
    .eq("task", payload.task)
    .eq("status", "shadow")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shadowErr) throw shadowErr;
  return shadow ? { row: shadow as unknown as PipelineRow } : null;
}

async function loadStages(
  pipelineId: string,
  supabase: SupabaseClient
): Promise<PipelineStageRow[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select(
      "id, stage_order, role, config, enabled, required, model_version:model_versions ( name, version )"
    )
    .eq("pipeline_id", pipelineId)
    .order("stage_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PipelineStageRow[];
}

function toStageSpec(row: PipelineStageRow): VisionStageSpec {
  return {
    role: row.role,
    model_name: row.model_version.name,
    model_version: row.model_version.version,
    config: (row.config ?? {}) as Record<string, unknown>,
    enabled: row.enabled,
    required: row.required
  };
}

function toReportSummary(report: VisionStageReport) {
  return {
    role: report.role,
    model: `${report.model_name}@${report.model_version}`,
    skipped: report.skipped,
    skip_reason: report.skip_reason,
    duration_ms: report.duration_ms,
    output_metadata: report.output_metadata
  };
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
  supabase: SupabaseClient,
  jobId: string,
  captureId: string,
  message: string,
  code: string,
  retryable: boolean
): Promise<void> {
  const now = new Date().toISOString();
  if (retryable) {
    // Reset status back to 'queued' so the pg-boss retry actually runs.
    // Without this reset, runOne()'s `status !== 'queued'` guard would
    // skip every retry and the job wedges forever in 'running'.
    await supabase
      .from("analysis_jobs")
      .update({
        status: "queued",
        started_at: null,
        error: message,
        error_code: code
      })
      .eq("id", jobId);
    await supabase
      .from("captures")
      .update({ status: "analysis_queued", status_message: message })
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
