import { getDb } from "../lib/db.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../lib/errors.js";
import { CAPTURES_BUCKET, capturePath } from "../lib/storage.js";

const reserveSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  cropTypeId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  source: z.enum([
    "field_capture_pwa",
    "bulk_upload",
    "gaia_r",
    "gaia_d",
    "gaia_s",
    "integration"
  ]),
  mediaType: z.enum(["photo", "burst_frame", "video"]),
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
  metadata: z.record(z.unknown()).optional()
});

const finalizeSchema = z.object({
  actualSizeBytes: z.number().int().positive(),
  actualChecksumSha256: z.string().length(64).optional(),
  thumbnailDataUrl: z.string().optional()
});

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

const capturesRoutes: FastifyPluginAsync = async (app) => {
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
          source: body.source,
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
          "id, org_id, storage_path, storage_bucket, status, mime_type, captured_at, session_id, captured_by_user_id"
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

      return {
        captureId: id,
        analysisJobId: jobId,
        status: "analysis_queued",
        thumbnailPath
      };
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
