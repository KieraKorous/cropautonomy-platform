// POST /api/captures
//
// Reserve a capture row and mint a signed upload URL pointing directly at
// Supabase Storage. The browser then uploads the binary bytes itself; the
// server never streams the media. See docs/architecture/capture-pipeline.md
// § Upload protocol.

import { z } from "zod";
import {
  HttpError,
  requireTechnician,
  toErrorResponse
} from "../../../lib/auth.js";
import { corsHeaders, handlePreflight } from "../../../lib/cors.js";
import {
  capturePath,
  CAPTURES_BUCKET,
  getServiceSupabase
} from "../../../lib/supabase.js";

export const runtime = "nodejs";

const requestSchema = z.object({
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
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024), // 2GB ceiling
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

const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function POST(request: Request) {
  try {
    const caller = await requireTechnician();

    const body = requestSchema.parse(await request.json());
    const supabase = getServiceSupabase();

    // Validate the referenced foreign IDs all belong to the caller's org.
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
        storage_path: "pending", // patched below
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

    const path = capturePath(caller.orgId, capture.id as string, extension);

    const { error: pathErr } = await supabase
      .from("captures")
      .update({ storage_path: path })
      .eq("id", capture.id);
    if (pathErr) throw pathErr;

    const { data: signed, error: signErr } = await supabase.storage
      .from(CAPTURES_BUCKET)
      .createSignedUploadUrl(path);
    if (signErr) throw signErr;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return withCorsHeaders(
      Response.json({
        captureId: capture.id,
        storagePath: path,
        uploadUrl: signed.signedUrl,
        uploadToken: signed.token,
        uploadMethod: "put",
        uploadHeaders: { "content-type": body.mimeType, "x-upsert": "false" },
        expiresAt
      }),
      request
    );
  } catch (error) {
    return withCorsHeaders(toErrorResponse(error), request);
  }
}

async function validateOrgScoped(
  orgId: string,
  body: z.infer<typeof requestSchema>
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

  const supabase = getServiceSupabase();
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select("id")
      .eq("id", check.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new HttpError(
        404,
        `Referenced ${check.label} does not exist in this organization.`
      );
  }
}

function withCorsHeaders(response: Response, request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}
