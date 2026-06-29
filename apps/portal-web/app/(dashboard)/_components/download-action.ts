"use server";

import { ApiError, getCapture } from "../../../lib/api";

// Resolve a freshly-signed URL for a capture's *original* media (not the list
// thumbnail) plus a clean download filename. The single-capture endpoint signs
// the full-resolution object, so this works for both photos and session
// recordings. Returns an error string instead of throwing so the client button
// can surface it inline.
export async function getCaptureDownload(
  id: string
): Promise<{ url: string; filename: string } | { error: string }> {
  try {
    const { capture } = await getCapture(id);
    if (!capture.imageUrl) {
      return { error: "This capture isn't ready to download yet." };
    }
    // Extension is cosmetic on the saved file; derive a sane one from the media
    // type rather than the stored path (some recordings have a mangled ext).
    const ext = capture.mediaType === "video" ? "webm" : "jpg";
    const date = new Date(capture.capturedAt).toISOString().slice(0, 10);
    const base =
      capture.kind === "session_recording"
        ? "recording"
        : slug(capture.plantType) ?? "capture";
    return { url: capture.imageUrl, filename: `${base}-${date}.${ext}` };
  } catch (err) {
    return {
      error: err instanceof ApiError ? err.message : "Couldn't prepare the download."
    };
  }
}

function slug(value: string | null): string | null {
  if (!value) return null;
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}
