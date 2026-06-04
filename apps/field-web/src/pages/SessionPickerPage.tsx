import { Link, Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { ChromeLayout } from "../components/ChromeLayout.js";
import { api } from "../lib/api.js";
import { blobToThumbnailDataUrl, nowIso } from "../lib/capture-camera.js";
import { enqueueCapture, getPairedDevice, type PairedDevice } from "../lib/db.js";
import { useLiveRequest } from "../lib/liveRequest.js";
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
  const [device, setDevice] = useState<PairedDevice | null>(null);
  // Whether this device is configured to go live without watcher approval. Read
  // fresh on open so a portal toggle takes effect without re-pairing.
  const [autoLive, setAutoLive] = useState(false);
  const autoFiredRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // A paired phone goes live through the request/accept gate; an unpaired phone
  // can still start a capture-only session directly.
  const live = useLiveRequest(device);

  useEffect(() => {
    void getPairedDevice().then(setDevice);
  }, []);

  // Learn this device's auto-live config once it's known.
  useEffect(() => {
    if (!device) return;
    let alive = true;
    void api
      .getDeviceLiveConfig(device.deviceId)
      .then((cfg) => {
        if (alive) setAutoLive(cfg.autoLiveEnabled);
      })
      .catch(() => {
        /* fall back to the manual request flow if config can't be read */
      });
    return () => {
      alive = false;
    };
  }, [device]);

  // Auto-live: connect to live automatically on open instead of waiting for the
  // operator to tap "Request to go live". Fires once; the server grants
  // immediately and the request hook adopts the session → redirect to /capture.
  useEffect(() => {
    if (!device || !autoLive || autoFiredRef.current) return;
    if (live.status !== "idle") return;
    autoFiredRef.current = true;
    void live.request();
  }, [device, autoLive, live]);

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

  // Paired phones go live through the gate: fire the request, then wait for a
  // watcher's grant. On grant the hook adopts the session and this page redirects
  // to /capture (the `if (session)` branch below).
  async function handleRequestGoLive() {
    setError(null);
    await live.request();
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

        {device && (live.status === "pending" || live.status === "requesting") && (
          <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-base-content/80">
            <div className="flex items-center justify-between gap-3">
              <span>
                {autoLive
                  ? `Connecting “${device.deviceName}” to live…`
                  : `Waiting for a supervisor to accept “${device.deviceName}”…`}
              </span>
              <button
                type="button"
                onClick={() => void live.cancel()}
                className="font-semibold text-base-content/60 hover:text-error"
              >
                Cancel
              </button>
            </div>
            {live.debug ? (
              <p className="font-mono text-[11px] leading-tight text-base-content/55">
                {live.debug}
              </p>
            ) : null}
          </div>
        )}
        {device && live.status === "rejected" && (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-warning/40 bg-warning/[0.07] px-5 py-5">
            <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning">
              Request declined
            </span>
            <h2 className="text-base font-semibold text-neutral">Held at the gate.</h2>
            <p className="text-sm leading-relaxed text-base-content/70">
              A supervisor didn&rsquo;t wave “{device.deviceName}” onto the live wall
              this time. No harm done — line up another request whenever you&rsquo;re
              ready to roll.
            </p>
            <button
              type="button"
              onClick={handleRequestGoLive}
              className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content shadow-sm hover:bg-primary/90"
            >
              Request again
            </button>
          </section>
        )}
        {device && live.status === "error" && live.error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {live.error}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={device ? handleRequestGoLive : handleStart}
              disabled={busy || uploading || live.status === "requesting" || live.status === "pending"}
              className="flex h-16 flex-1 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm disabled:opacity-60"
            >
              {device
                ? live.status === "pending" || live.status === "requesting"
                  ? autoLive
                    ? "Connecting…"
                    : "Requested…"
                  : autoLive
                    ? "Connect to live"
                    : "Request to go live"
                : busy
                  ? "Starting…"
                  : "Start session"}
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
          {device ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={busy || uploading}
              className="text-sm font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline disabled:opacity-60"
            >
              {busy ? "Starting…" : "Start a capture-only session instead"}
            </button>
          ) : (
            <Link
              to="/pair"
              className="text-sm font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline"
            >
              Pair this phone as a camera
            </Link>
          )}
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
