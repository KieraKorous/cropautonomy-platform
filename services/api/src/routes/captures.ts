import { getDb } from "../lib/db.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../lib/errors.js";
import { getBoss } from "../lib/queue.js";
import { loadConfig } from "../config.js";
import { CAPTURES_BUCKET, capturePath } from "../lib/storage.js";
import { publishBestEffort } from "../lib/live.js";
import { channels } from "@gaia/realtime/channels";
import { QUEUE_NAMES } from "@gaia/workers/queues";

// Operator observation taxonomy — kept in sync with the captures.observation_type
// and captures.severity check constraints in
// packages/db/migrations/0016_capture_annotations_and_recordings.sql.
const OBSERVATION_TYPE = z.enum([
  "pest",
  "disease",
  "weed",
  "nutrient",
  "irrigation",
  "damage",
  "growth_stage",
  "other"
]);
const SEVERITY = z.enum(["low", "medium", "high"]);

const reserveSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  cropTypeId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  // The device that produced this capture (e.g. the paired phone running the
  // field app). Recorded as captures.source_device_id so capture activity —
  // including capture-only sessions, which carry no started_by_device_id — is
  // attributable to a device. See org_device_activity (migration 0022).
  deviceId: z.string().uuid().nullable().optional(),
  source: z.enum([
    "field_capture_pwa",
    "bulk_upload",
    "portal_recording",
    "gaia_r",
    "gaia_d",
    "gaia_s",
    "integration"
  ]),
  mediaType: z.enum(["photo", "burst_frame", "video"]),
  // 'observation' (default) vs 'session_recording' (a saved live-feed video).
  kind: z.enum(["observation", "session_recording"]).optional(),
  burstIndex: z.number().int().nonnegative().nullable().optional(),
  videoDurationMs: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  checksumSha256: z.string().length(64).nullable().optional(),
  capturedAt: z.string().datetime({ offset: true }),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracyMeters: z.number().optional()
    })
    .nullable()
    .optional(),
  headingDegrees: z.number().nullable().optional(),
  // Note: observation description / type / severity are NOT set here. They are
  // produced automatically by the analysis pipeline's summary stage, not
  // hand-entered at capture time.
  metadata: z.record(z.unknown()).optional()
});

const finalizeSchema = z.object({
  actualSizeBytes: z.number().int().positive(),
  actualChecksumSha256: z.string().length(64).optional(),
  thumbnailDataUrl: z.string().optional()
});

// Reviewer corrections to the AI-filled capture details. The pipeline fills
// these automatically (summary stage); this endpoint lets a reviewer override
// them. Every field optional; only provided keys are written. Empty-string
// summary clears it (stored as null); null clears the structured fields.
const updateSchema = z
  .object({
    summary: z.string().max(4000).optional(),
    details: z.string().max(8000).optional(),
    observationType: OBSERVATION_TYPE.nullable().optional(),
    severity: SEVERITY.nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  // false (default) → only live captures; true → only discarded (settings view).
  discarded: z.coerce.boolean().default(false),
  // Optional kind filter — the portal Recordings section passes
  // kind=session_recording; the captures grid defaults to observations.
  kind: z.enum(["observation", "session_recording"]).optional()
});

// Statuses whose storage object exists and can be signed for viewing.
const VIEWABLE_STATUSES = new Set([
  "uploaded",
  "analysis_queued",
  "analysis_running",
  "analyzed"
]);

interface CaptureListRow {
  id: string;
  status: string;
  status_message: string | null;
  media_type: string;
  captured_at: string;
  uploaded_at: string | null;
  inferred_species: string | null;
  inferred_common_name: string | null;
  inferred_summary: string | null;
  inferred_details: string | null;
  description: string | null;
  observation_type: string | null;
  severity: string | null;
  kind: string;
  thumbnail_path: string | null;
  storage_path: string;
  size_bytes: number | null;
  video_duration_ms: number | null;
  field_id: string | null;
  session_id: string | null;
  analysis_job_id: string | null;
  discarded_at: string | null;
}

// Columns selected for the summary shape returned by the list and single-capture
// endpoints. Kept in one place so the row interface and selects stay in sync.
const CAPTURE_SELECT =
  "id, status, status_message, media_type, captured_at, uploaded_at, inferred_species, inferred_common_name, inferred_summary, inferred_details, description, observation_type, severity, kind, thumbnail_path, storage_path, size_bytes, video_duration_ms, field_id, session_id, analysis_job_id, discarded_at";

// Same columns plus org_id, for the single-capture handlers that tenant-check
// before mapping. `as const` keeps it a literal so the typed client can parse it.
const CAPTURE_SELECT_WITH_ORG = `${CAPTURE_SELECT}, org_id` as const;

// Map a DB row → API summary, attaching an already-signed image URL (or null).
function toCaptureSummary(row: CaptureListRow, imageUrl: string | null) {
  return {
    id: row.id,
    status: row.status,
    statusMessage: row.status_message,
    mediaType: row.media_type,
    capturedAt: row.captured_at,
    uploadedAt: row.uploaded_at,
    plantType: row.inferred_species,
    commonName: row.inferred_common_name,
    summary: row.inferred_summary,
    details: row.inferred_details,
    description: row.description,
    observationType: row.observation_type,
    severity: row.severity,
    kind: row.kind,
    imageUrl,
    fieldId: row.field_id,
    sessionId: row.session_id,
    sizeBytes: row.size_bytes,
    videoDurationMs: row.video_duration_ms,
    analysisJobId: row.analysis_job_id,
    discardedAt: row.discarded_at
  };
}

const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

// A storage_path is real once finalize has run; "pending" is the placeholder
// written at reservation time before the object exists.
const isRealPath = (path: string | null): path is string =>
  !!path && path !== "pending";

const capturesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/captures",
    { preHandler: app.requireAuth("captures.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("captures.invalid_query", "Invalid capture list query.", {
          issues: parsed.error.issues
        });
      }
      const { limit, offset, discarded, kind } = parsed.data;
      const supabase = getDb();

      let query = supabase
        .from("captures")
        .select(CAPTURE_SELECT)
        .eq("org_id", caller.orgId);
      query = discarded
        ? query.not("discarded_at", "is", null)
        : query.is("discarded_at", null);
      if (kind) query = query.eq("kind", kind);

      const { data, error } = await query
        .order("captured_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      const rows = (data ?? []) as CaptureListRow[];

      // Batch-sign the viewable objects in one round-trip. Prefer the thumbnail
      // when present; fall back to the original. Rows still pending upload have
      // no real object yet and get a null imageUrl.
      const pathByRow = new Map<string, string>();
      for (const row of rows) {
        if (!VIEWABLE_STATUSES.has(row.status)) continue;
        const path = row.thumbnail_path ?? row.storage_path;
        if (!path || path === "pending") continue;
        pathByRow.set(row.id, path);
      }

      const signedByPath = new Map<string, string>();
      const uniquePaths = [...new Set(pathByRow.values())];
      if (uniquePaths.length > 0) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(CAPTURES_BUCKET)
          .createSignedUrls(uniquePaths, 60 * 60);
        if (signErr) throw signErr;
        for (const item of signed ?? []) {
          if (item.signedUrl && !item.error && item.path) {
            signedByPath.set(item.path, item.signedUrl);
          }
        }
      }

      return {
        captures: rows.map((row) => {
          const path = pathByRow.get(row.id);
          return toCaptureSummary(row, path ? (signedByPath.get(path) ?? null) : null);
        }),
        limit,
        offset
      };
    }
  );

  // Single capture detail for the portal's /captures/{id} page. Returns the
  // capture with a signed full-size image (not the thumbnail) plus a `related`
  // list of other captures sharing the same identified species — drives the
  // detail page's same-plant bottom bar. Org-scoped; 404 across tenants.
  app.get<{ Params: { id: string }; Querystring: { relatedLimit?: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select(CAPTURE_SELECT_WITH_ORG)
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      const capture = row as CaptureListRow & { org_id: string };

      // Same-species siblings (excluding self). Only fetch when this capture has
      // an identified species; otherwise there's nothing to relate it to.
      const relatedLimit = Math.min(
        Math.max(Number(request.query.relatedLimit ?? 12) || 12, 1),
        50
      );
      let relatedRows: CaptureListRow[] = [];
      if (capture.inferred_species) {
        const { data: rel, error: relErr } = await supabase
          .from("captures")
          .select(CAPTURE_SELECT)
          .eq("org_id", caller.orgId)
          .eq("inferred_species", capture.inferred_species)
          .neq("id", id)
          .is("discarded_at", null)
          .order("captured_at", { ascending: false })
          .limit(relatedLimit);
        if (relErr) throw relErr;
        relatedRows = (rel ?? []) as CaptureListRow[];
      }

      // Sign the detail image (full-size original) and the related thumbnails in
      // one batch. The detail image prefers the original; related prefer thumbs.
      const pathByRow = new Map<string, string>();
      if (VIEWABLE_STATUSES.has(capture.status) && isRealPath(capture.storage_path)) {
        pathByRow.set(capture.id, capture.storage_path);
      }
      for (const rel of relatedRows) {
        if (!VIEWABLE_STATUSES.has(rel.status)) continue;
        const path = rel.thumbnail_path ?? rel.storage_path;
        if (!isRealPath(path)) continue;
        pathByRow.set(rel.id, path);
      }

      const signedByPath = new Map<string, string>();
      const uniquePaths = [...new Set(pathByRow.values())];
      if (uniquePaths.length > 0) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(CAPTURES_BUCKET)
          .createSignedUrls(uniquePaths, 60 * 60);
        if (signErr) throw signErr;
        for (const item of signed ?? []) {
          if (item.signedUrl && !item.error && item.path) {
            signedByPath.set(item.path, item.signedUrl);
          }
        }
      }

      const sign = (rowId: string): string | null => {
        const path = pathByRow.get(rowId);
        return path ? (signedByPath.get(path) ?? null) : null;
      };

      return {
        capture: toCaptureSummary(capture, sign(capture.id)),
        related: relatedRows.map((rel) => toCaptureSummary(rel, sign(rel.id)))
      };
    }
  );

  // Reviewer corrections to the AI-filled capture details (brief summary,
  // observation type, severity). Org-scoped; requires captures.update.
  app.patch<{ Params: { id: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid capture update body.", {
          issues: parsed.error.issues
        });
      }
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      // Only write the keys the caller supplied. Empty-string summary clears it;
      // null clears the structured fields. These overwrite the AI-filled values.
      const patch: Record<string, string | null> = {};
      if (parsed.data.summary !== undefined) {
        patch.inferred_summary = parsed.data.summary.trim() || null;
      }
      if (parsed.data.details !== undefined) {
        patch.inferred_details = parsed.data.details.trim() || null;
      }
      if (parsed.data.observationType !== undefined) {
        patch.observation_type = parsed.data.observationType ?? null;
      }
      if (parsed.data.severity !== undefined) {
        patch.severity = parsed.data.severity ?? null;
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update(patch)
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, ...patch };
    }
  );

  app.post(
    "/v1/captures",
    { preHandler: app.requireAuth("captures.create") },
    async (request, reply) => {
      const caller = request.auth!;
      const parsed = reserveSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid capture reservation body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      await validateOrgScoped(caller.orgId, body);

      const extension =
        mimeToExt[body.mimeType.toLowerCase()] ??
        body.mimeType.split("/")[1]?.toLowerCase() ??
        "bin";

      const { data: capture, error: insertErr } = await supabase
        .from("captures")
        .insert({
          org_id: caller.orgId,
          farm_id: body.farmId ?? null,
          field_id: body.fieldId ?? null,
          zone_id: body.zoneId ?? null,
          crop_type_id: body.cropTypeId ?? null,
          session_id: body.sessionId ?? null,
          source_device_id: body.deviceId ?? null,
          source: body.source,
          kind: body.kind ?? "observation",
          captured_by_user_id: caller.userId,
          media_type: body.mediaType,
          burst_index: body.burstIndex ?? null,
          video_duration_ms: body.videoDurationMs ?? null,
          mime_type: body.mimeType,
          size_bytes: body.sizeBytes,
          checksum_sha256: body.checksumSha256 ?? null,
          storage_bucket: CAPTURES_BUCKET,
          storage_path: "pending",
          captured_at: body.capturedAt,
          location: body.location
            ? `SRID=4326;POINT(${body.location.lng} ${body.location.lat})`
            : null,
          gps_accuracy_meters: body.location?.accuracyMeters ?? null,
          heading_degrees: body.headingDegrees ?? null,
          status: "pending_upload",
          metadata: body.metadata ?? {}
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const captureId = (capture as { id: string }).id;
      const path = capturePath(caller.orgId, captureId, extension);

      const { error: pathErr } = await supabase
        .from("captures")
        .update({ storage_path: path })
        .eq("id", captureId);
      if (pathErr) throw pathErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from(CAPTURES_BUCKET)
        .createSignedUploadUrl(path);
      if (signErr) throw signErr;

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      reply.status(201);
      return {
        captureId,
        storagePath: path,
        uploadUrl: signed.signedUrl,
        uploadToken: signed.token,
        uploadMethod: "put" as const,
        uploadHeaders: { "content-type": body.mimeType, "x-upsert": "false" },
        expiresAt
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/finalize",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const parsed = finalizeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid finalize body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      const { data: captureRow, error: loadErr } = await supabase
        .from("captures")
        .select(
          "id, org_id, storage_path, storage_bucket, status, mime_type, media_type, kind, captured_at, session_id, captured_by_user_id"
        )
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!captureRow) throw notFound("captures.not_found", "Capture not found.");

      const capture = captureRow as {
        id: string;
        org_id: string;
        storage_path: string;
        storage_bucket: string;
        status: string;
        mime_type: string;
        media_type: string;
        kind: string;
        captured_at: string;
        session_id: string | null;
        captured_by_user_id: string;
      };

      if (capture.org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      if (capture.captured_by_user_id !== caller.userId) {
        throw forbidden(
          "captures.not_operator",
          "Capture belongs to a different operator."
        );
      }
      if (capture.status !== "pending_upload" && capture.status !== "uploading") {
        throw conflict(
          "captures.invalid_transition",
          `Capture cannot be finalized in status '${capture.status}'.`
        );
      }

      const folder = capture.storage_path.split("/").slice(0, -1).join("/");
      const filename = capture.storage_path.split("/").pop();
      const { data: listing, error: listErr } = await supabase.storage
        .from(capture.storage_bucket)
        .list(folder, { search: filename ?? undefined });
      if (listErr) throw listErr;
      const stored = listing?.find((item) => item.name === filename);
      if (!stored) {
        throw conflict(
          "captures.storage_missing",
          "Storage object not found at the expected path."
        );
      }
      const storedSize = (stored.metadata as { size?: number } | null)?.size ?? 0;
      if (storedSize !== body.actualSizeBytes) {
        throw conflict(
          "captures.size_mismatch",
          `Storage size mismatch (expected ${body.actualSizeBytes}, found ${storedSize}).`
        );
      }

      let thumbnailPath: string | null = null;
      if (body.thumbnailDataUrl) {
        thumbnailPath = await uploadThumbnail(
          capture.storage_bucket,
          capture.storage_path,
          body.thumbnailDataUrl
        );
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update({
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
          size_bytes: body.actualSizeBytes,
          checksum_sha256: body.actualChecksumSha256 ?? null,
          thumbnail_path: thumbnailPath
        })
        .eq("id", id);
      if (updateErr) throw updateErr;

      // The plant-classification pipeline expects a still image. Videos —
      // including saved live-feed recordings (kind='session_recording') — are
      // stored as raw for v0 and skip analysis entirely. Keyframe-based analysis
      // is future work (see docs/architecture/capture-pipeline.md).
      if (capture.media_type === "video") {
        return {
          captureId: id,
          analysisJobId: null,
          status: "uploaded",
          thumbnailPath
        };
      }

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .insert({
          org_id: caller.orgId,
          capture_id: id,
          status: "queued"
        })
        .select("id")
        .single();
      if (jobErr) throw jobErr;

      const jobId = (job as { id: string }).id;

      const { error: linkErr } = await supabase
        .from("captures")
        .update({
          analysis_job_id: jobId,
          status: "analysis_queued"
        })
        .eq("id", id);
      if (linkErr) throw linkErr;

      // Announce the new capture on the org-wide feed so open list views (the
      // captures page) pick it up live, without waiting for a refresh.
      await publishBestEffort(request.log, channels.orgCaptures(caller.orgId), {
        type: "capture.changed",
        version: 1,
        payload: {
          captureId: id,
          orgId: caller.orgId,
          status: "analysis_queued",
          changeType: "created"
        }
      });

      // Enqueue the analysis job. The DB row is already 'queued'; this hands
      // off to the worker, which transitions to 'running' when picked up.
      // pg-boss send is idempotent on its own job id; the DB analysis_jobs row
      // is the durable record. A send failure here means the worker won't run
      // unless we re-queue; surface as 500 so the client retries finalize.
      try {
        const boss = await getBoss({ connectionString: loadConfig().DATABASE_URL });
        await boss.send(QUEUE_NAMES.scanAnalysisRequested, {
          captureId: id,
          analysisJobId: jobId,
          orgId: caller.orgId,
          task: "plant_classification"
        });
      } catch (queueErr) {
        request.log.error(
          { err: queueErr, captureId: id, analysisJobId: jobId },
          "failed to enqueue scan.analysis.requested"
        );
        throw queueErr;
      }

      return {
        captureId: id,
        analysisJobId: jobId,
        status: "analysis_queued",
        thumbnailPath
      };
    }
  );

  // Soft discard — hides the capture from the default list without deleting the
  // row or its Storage object. Reversible (clear discarded_at). Idempotent.
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/discard",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      const discardedAt = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("captures")
        .update({ discarded_at: discardedAt })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, discardedAt };
    }
  );

  // Recover — reverses a discard by clearing discarded_at, returning the capture
  // to the default list. Idempotent (recovering a live capture is a no-op).
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/recover",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update({ discarded_at: null })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, recovered: true };
    }
  );

  // Re-queue analysis for a capture whose analysis previously failed. The
  // Storage object already exists, so this just inserts a fresh analysis_jobs
  // row, points the capture back at it, and re-enqueues the worker — the same
  // tail as finalize. Only 'failed' captures are retryable (the active-job
  // unique index in 0004 forbids re-queuing one that's still in flight).
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/reanalyze",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id, status")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      if ((row as { status: string }).status !== "failed") {
        throw conflict(
          "captures.invalid_transition",
          `Only failed captures can be re-analyzed (status '${(row as { status: string }).status}').`
        );
      }

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .insert({ org_id: caller.orgId, capture_id: id, status: "queued" })
        .select("id")
        .single();
      if (jobErr) throw jobErr;
      const jobId = (job as { id: string }).id;

      const { error: linkErr } = await supabase
        .from("captures")
        .update({
          analysis_job_id: jobId,
          status: "analysis_queued",
          status_message: null
        })
        .eq("id", id);
      if (linkErr) throw linkErr;

      try {
        const boss = await getBoss({ connectionString: loadConfig().DATABASE_URL });
        await boss.send(QUEUE_NAMES.scanAnalysisRequested, {
          captureId: id,
          analysisJobId: jobId,
          orgId: caller.orgId,
          task: "plant_classification"
        });
      } catch (queueErr) {
        request.log.error(
          { err: queueErr, captureId: id, analysisJobId: jobId },
          "failed to enqueue scan.analysis.requested (reanalyze)"
        );
        throw queueErr;
      }

      // Reflect the re-queue on the org-wide feed so list views update the row's
      // status back to analyzing without a refresh.
      await publishBestEffort(request.log, channels.orgCaptures(caller.orgId), {
        type: "capture.changed",
        version: 1,
        payload: {
          captureId: id,
          orgId: caller.orgId,
          status: "analysis_queued",
          changeType: "analyzing"
        }
      });

      return { captureId: id, analysisJobId: jobId, status: "analysis_queued" };
    }
  );

  // Permanent delete — removes the Storage object(s) and the capture row. Only
  // discarded captures are purgeable. analysis_jobs / analysis_results cascade
  // on the captures FK (0004). Requires captures.delete (manager and up).
  app.delete<{ Params: { id: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id, storage_bucket, storage_path, thumbnail_path, discarded_at")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      const capture = row as {
        storage_bucket: string;
        storage_path: string;
        thumbnail_path: string | null;
        discarded_at: string | null;
      };
      if (!capture.discarded_at) {
        throw conflict(
          "captures.not_discarded",
          "Only discarded captures can be permanently deleted."
        );
      }

      // Remove Storage objects first. Skip the "pending" placeholder path of
      // captures that never finished uploading.
      const paths: string[] = [];
      if (capture.storage_path && capture.storage_path !== "pending") {
        paths.push(capture.storage_path);
      }
      if (capture.thumbnail_path) paths.push(capture.thumbnail_path);
      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from(capture.storage_bucket)
          .remove(paths);
        if (removeErr) throw removeErr;
      }

      const { error: deleteErr } = await supabase
        .from("captures")
        .delete()
        .eq("id", id);
      if (deleteErr) throw deleteErr;

      return { captureId: id, deleted: true };
    }
  );
};

async function validateOrgScoped(
  orgId: string,
  body: z.infer<typeof reserveSchema>
) {
  const checks: Array<{ table: string; id: string; label: string }> = [];
  if (body.farmId) checks.push({ table: "farms", id: body.farmId, label: "farm" });
  if (body.fieldId) checks.push({ table: "fields", id: body.fieldId, label: "field" });
  if (body.zoneId) checks.push({ table: "zones", id: body.zoneId, label: "zone" });
  if (body.cropTypeId)
    checks.push({ table: "crop_types", id: body.cropTypeId, label: "crop type" });
  if (body.sessionId)
    checks.push({
      table: "capture_sessions",
      id: body.sessionId,
      label: "capture session"
    });
  if (body.deviceId)
    checks.push({ table: "devices", id: body.deviceId, label: "device" });
  if (checks.length === 0) return;

  const supabase = getDb();
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select("id")
      .eq("id", check.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw notFound(
        "references.not_found",
        `Referenced ${check.label} does not exist in this organization.`
      );
    }
  }
}

async function uploadThumbnail(
  bucket: string,
  originalPath: string,
  dataUrl: string
): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw badRequest("captures.invalid_thumbnail", "Invalid thumbnail data URL.");
  }
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const thumbPath = originalPath.replace(/\.[^.]+$/, "") + "_thumb.jpg";
  const supabase = getDb();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(thumbPath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return thumbPath;
}

export default capturesRoutes;
