// POST /api/captures/{id}/finalize
//
// Called by the PWA after the direct browser->Storage upload completes.
// Verifies the object exists, persists thumbnail + size + checksum, transitions
// status, and enqueues the analysis job. See docs/architecture/capture-pipeline.md.

import { z } from "zod";
import {
  HttpError,
  requireTechnician,
  toErrorResponse
} from "../../../../../lib/auth.js";
import { corsHeaders, handlePreflight } from "../../../../../lib/cors.js";
import {
  CAPTURES_BUCKET,
  getServiceSupabase
} from "../../../../../lib/supabase.js";

export const runtime = "nodejs";

const bodySchema = z.object({
  actualSizeBytes: z.number().int().positive(),
  actualChecksumSha256: z.string().length(64).optional(),
  thumbnailDataUrl: z.string().optional()
});

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new HttpError(400, "Invalid capture id.");
    }
    const caller = await requireTechnician();
    const body = bodySchema.parse(await request.json());

    const supabase = getServiceSupabase();

    const { data: capture, error: loadErr } = await supabase
      .from("captures")
      .select("id, org_id, storage_path, storage_bucket, status, mime_type, captured_at, session_id, captured_by_user_id")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!capture) throw new HttpError(404, "Capture not found.");
    if (capture.org_id !== caller.orgId)
      throw new HttpError(403, "Capture does not belong to this organization.");
    if (capture.captured_by_user_id !== caller.userId)
      throw new HttpError(403, "Capture belongs to a different operator.");
    if (capture.status !== "pending_upload" && capture.status !== "uploading")
      throw new HttpError(
        409,
        `Capture cannot be finalized in status '${capture.status}'.`
      );

    // Verify the object exists in storage at the expected path with the expected size.
    const folder = (capture.storage_path as string).split("/").slice(0, -1).join("/");
    const filename = (capture.storage_path as string).split("/").pop();
    const { data: listing, error: listErr } = await supabase.storage
      .from(capture.storage_bucket as string)
      .list(folder, { search: filename });
    if (listErr) throw listErr;
    const stored = listing?.find((item) => item.name === filename);
    if (!stored)
      throw new HttpError(409, "Storage object not found at the expected path.");
    const storedSize = (stored.metadata as { size?: number } | null)?.size ?? 0;
    if (storedSize !== body.actualSizeBytes)
      throw new HttpError(
        409,
        `Storage size mismatch (expected ${body.actualSizeBytes}, found ${storedSize}).`
      );

    let thumbnailPath: string | null = null;
    if (body.thumbnailDataUrl) {
      thumbnailPath = await uploadThumbnail(
        capture.storage_bucket as string,
        capture.storage_path as string,
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

    // Create the analysis_jobs row. The pg-boss enqueue happens here once
    // the worker exists; for v0 the row's presence is enough for the portal
    // surfaces to show "analysis queued".
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

    const { error: linkErr } = await supabase
      .from("captures")
      .update({
        analysis_job_id: job.id,
        status: "analysis_queued"
      })
      .eq("id", id);
    if (linkErr) throw linkErr;

    return withCorsHeaders(
      Response.json({
        captureId: id,
        analysisJobId: job.id,
        status: "analysis_queued",
        thumbnailPath
      }),
      request
    );
  } catch (error) {
    return withCorsHeaders(toErrorResponse(error), request);
  }
}

async function uploadThumbnail(
  bucket: string,
  originalPath: string,
  dataUrl: string
): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new HttpError(400, "Invalid thumbnail data URL.");
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const thumbPath = originalPath.replace(/\.[^.]+$/, "") + "_thumb.jpg";
  const { error } = await getServiceSupabase()
    .storage.from(bucket)
    .upload(thumbPath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return thumbPath;
}

function withCorsHeaders(response: Response, request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

// silence unused import warning when bucket name not used elsewhere
void CAPTURES_BUCKET;
