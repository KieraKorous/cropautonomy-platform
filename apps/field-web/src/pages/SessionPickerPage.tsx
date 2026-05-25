import { Navigate } from "react-router-dom";
import { useRef, useState } from "react";

import { ChromeLayout } from "../components/ChromeLayout.js";
import { blobToThumbnailDataUrl, nowIso } from "../lib/capture-camera.js";
import { enqueueCapture } from "../lib/db.js";
import { useActiveSession } from "../lib/session.js";
import { kickUploadWorker } from "../lib/upload.js";

// Single-screen picker: confirm where the operator is, start the session,
// hand off to the capture view. Field/farm dropdowns are placeholders until
// services/api exposes farm/field endpoints — for v0 the operator can start
// "no field set" and the capture still tags via GPS.

export function SessionPickerPage() {
  const { session, loading, start } = useActiveSession();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  if (loading) {
    return (
      <ChromeLayout title="Field Capture" eyebrow="CropAutonomy">
        <div className="grid h-full place-items-center text-sm text-base-content/55">
          Loading…
        </div>
      </ChromeLayout>
    );
  }

  if (session) {
    // Declarative redirect — calling navigate() during render emits React
    // warnings about updating BrowserRouter mid-render.
    return <Navigate to="/capture" replace />;
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const initialLocation = await tryGetLocation();
      await start({ initialLocation });
      // No need to navigate — the next render returns <Navigate to="/capture" />.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const location = await tryGetLocation();
      let added = 0;
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;
        const thumb =
          isImage && file.size < 20 * 1024 * 1024
            ? await blobToThumbnailDataUrl(file).catch(() => undefined)
            : undefined;
        await enqueueCapture({
          id: crypto.randomUUID(),
          source: "field_capture_pwa",
          mediaType: isVideo ? "video" : "photo",
          mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
          sizeBytes: file.size,
          capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
          location,
          thumbnailDataUrl: thumb,
          blob: file
        });
        added += 1;
      }
      setUploadCount((prev) => prev + added);
      kickUploadWorker();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue upload.");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  return (
    <ChromeLayout title="Field Capture" eyebrow="CropAutonomy">
      <div className="flex h-full flex-col gap-6 px-6 pb-8 pt-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral">
            Ready to walk a field
          </h2>
          <p className="mt-2 text-base text-base-content/65">
            Start a session and the portal will see your captures as they come in.
            Where you are is tagged from GPS automatically; you can set a specific
            field later.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {uploadCount > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-base-content/75">
            Queued {uploadCount} {uploadCount === 1 ? "file" : "files"} for upload.
            They&rsquo;ll sync from the queue tab.
          </div>
        )}

        <div className="mt-auto flex gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={busy || uploading}
            className="flex h-16 flex-1 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm disabled:opacity-60"
          >
            {busy ? "Starting…" : "Start session"}
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={busy || uploading}
            className="flex h-16 flex-1 items-center justify-center rounded-md border border-base-content/15 bg-base-100 text-base font-semibold text-neutral shadow-sm disabled:opacity-60"
          >
            {uploading ? "Queuing…" : "Upload"}
          </button>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => void handleUpload(e.currentTarget.files)}
        />
      </div>
    </ChromeLayout>
  );
}

async function tryGetLocation(): Promise<
  { lat: number; lng: number; accuracyMeters?: number } | undefined
> {
  if (!("geolocation" in navigator)) return undefined;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyMeters: p.coords.accuracy
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8000 }
    );
  });
}
