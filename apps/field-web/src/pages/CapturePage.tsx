import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";

import { Hud } from "../components/Hud.js";
import {
  blobToThumbnailDataUrl,
  nowIso,
  useCameraStream
} from "../lib/capture-camera.js";
import { enqueueCapture, listPendingForUpload } from "../lib/db.js";
import { useGps } from "../lib/hud-signals.js";
import { useActiveSession } from "../lib/session.js";
import { kickUploadWorker } from "../lib/upload.js";
import { useLivePublisher } from "../lib/webrtc.js";

// Capture screen. Camera fills the middle; HUD across the top; mode + capture
// button at the bottom. No nav. One screen does the job; queue + settings
// reachable from the HUD or a long-press on the capture button.

type Mode = "photo" | "burst" | "video";

export function CapturePage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { session, pause, resume, end } = useActiveSession();
  const { stream, videoRef, captureFrame, error } = useCameraStream();
  const gps = useGps(true);
  const [mode, setMode] = useState<Mode>("photo");
  const [queueCount, setQueueCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const burstAbortRef = useRef<{ aborted: boolean } | null>(null);

  // Refresh the queue count whenever this page is in focus.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const pending = await listPendingForUpload();
      if (alive) setQueueCount(pending.length);
    }
    void refresh();
    const interval = setInterval(refresh, 1500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // WebRTC mesh publisher for live preview. Operator's session id + clerk id
  // are the addressable handles.
  useLivePublisher({
    orgId: session?.orgId ?? "",
    sessionId: session?.sessionId ?? "",
    operatorId: user?.id ?? "",
    stream,
    enabled: Boolean(session && stream && user)
  });

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        /* iOS will require a user gesture; the page mount usually counts */
      });
    }
  }, [stream, videoRef]);

  if (!session) {
    navigate("/", { replace: true });
    return null;
  }

  const location =
    gps.status === "fix" && gps.position
      ? {
          lat: gps.position.coords.latitude,
          lng: gps.position.coords.longitude,
          accuracyMeters: gps.position.coords.accuracy
        }
      : undefined;

  async function shootPhoto() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await captureFrame("image/jpeg", 0.92);
      const thumb = await blobToThumbnailDataUrl(blob).catch(() => undefined);
      await enqueueCapture({
        id: crypto.randomUUID(),
        sessionId: session!.sessionId,
        orgId: session!.orgId,
        farmId: session!.farmId,
        fieldId: session!.fieldId,
        cropTypeId: session!.cropTypeId,
        source: "field_capture_pwa",
        mediaType: "photo",
        mimeType: blob.type || "image/jpeg",
        sizeBytes: blob.size,
        capturedAt: nowIso(),
        location,
        thumbnailDataUrl: thumb,
        blob
      });
      kickUploadWorker();
    } finally {
      setBusy(false);
    }
  }

  async function runBurst() {
    if (busy) return;
    setBusy(true);
    const control = { aborted: false };
    burstAbortRef.current = control;
    try {
      let index = 0;
      while (!control.aborted && index < 12) {
        const blob = await captureFrame("image/jpeg", 0.85);
        const thumb = index === 0
          ? await blobToThumbnailDataUrl(blob).catch(() => undefined)
          : undefined;
        await enqueueCapture({
          id: crypto.randomUUID(),
          sessionId: session!.sessionId,
          orgId: session!.orgId,
          farmId: session!.farmId,
          fieldId: session!.fieldId,
          cropTypeId: session!.cropTypeId,
          source: "field_capture_pwa",
          mediaType: "burst_frame",
          burstIndex: index,
          mimeType: blob.type || "image/jpeg",
          sizeBytes: blob.size,
          capturedAt: nowIso(),
          location,
          thumbnailDataUrl: thumb,
          blob
        });
        index += 1;
        // ~3 frames / second cap
        await new Promise((r) => setTimeout(r, 333));
      }
      kickUploadWorker();
    } finally {
      setBusy(false);
      burstAbortRef.current = null;
    }
  }

  function stopBurst() {
    if (burstAbortRef.current) burstAbortRef.current.aborted = true;
  }

  async function toggleVideo() {
    if (videoRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (!stream) return;
    const recorder = new MediaRecorder(stream, { mimeType: pickVideoMime() });
    videoChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };
    const startedAt = nowIso();
    const startedMs = Date.now();
    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || "video/webm";
      const blob = new Blob(videoChunksRef.current, { type: mimeType });
      videoChunksRef.current = [];
      setVideoRecording(false);
      await enqueueCapture({
        id: crypto.randomUUID(),
        sessionId: session!.sessionId,
        orgId: session!.orgId,
        farmId: session!.farmId,
        fieldId: session!.fieldId,
        cropTypeId: session!.cropTypeId,
        source: "field_capture_pwa",
        mediaType: "video",
        videoDurationMs: Date.now() - startedMs,
        mimeType,
        sizeBytes: blob.size,
        capturedAt: startedAt,
        location,
        blob
      });
      kickUploadWorker();
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setVideoRecording(true);
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <Hud queueCount={queueCount} sessionStatus={session.status} />

      <main className="relative flex-1 overflow-hidden bg-black">
        {error ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-base-content/70">
            <div>
              <p className="text-base font-semibold text-base-100">Camera unavailable</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}

        {videoRecording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-error/85 px-2.5 py-1 text-xs font-semibold text-error-content shadow">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error-content" />
            Recording
          </div>
        )}
      </main>

      <footer className="safe-bottom bg-base-100/95 px-4 pb-5 pt-4">
        <ModeSwitcher mode={mode} onChange={setMode} disabled={busy || videoRecording} />
        <div className="mt-4 flex items-center justify-between gap-4">
          <SessionControls
            status={session.status}
            onPause={pause}
            onResume={resume}
            onEnd={async () => {
              await end();
              navigate("/", { replace: true });
            }}
          />
          <CaptureButton
            mode={mode}
            busy={busy}
            videoRecording={videoRecording}
            onShoot={shootPhoto}
            onBurstStart={runBurst}
            onBurstStop={stopBurst}
            onVideoToggle={toggleVideo}
          />
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label="Settings"
            className="flex h-12 w-12 items-center justify-center rounded-md border border-base-content/15 bg-base-100 text-base-content/70"
          >
            <CogIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}

function ModeSwitcher({
  mode,
  onChange,
  disabled
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled: boolean;
}) {
  const modes: Array<{ id: Mode; label: string }> = [
    { id: "photo", label: "Photo" },
    { id: "burst", label: "Burst" },
    { id: "video", label: "Video" }
  ];
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-base-content/15 bg-base-100">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(m.id)}
          className={`flex-1 py-2 text-sm font-medium transition ${
            mode === m.id
              ? "bg-neutral text-neutral-content"
              : "text-base-content/70 hover:bg-base-content/[0.04]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function CaptureButton({
  mode,
  busy,
  videoRecording,
  onShoot,
  onBurstStart,
  onBurstStop,
  onVideoToggle
}: {
  mode: Mode;
  busy: boolean;
  videoRecording: boolean;
  onShoot: () => void;
  onBurstStart: () => void;
  onBurstStop: () => void;
  onVideoToggle: () => void;
}) {
  if (mode === "video") {
    return (
      <button
        type="button"
        onClick={onVideoToggle}
        aria-label={videoRecording ? "Stop recording" : "Start recording"}
        className={`relative flex h-20 w-20 items-center justify-center rounded-full border-4 ${
          videoRecording ? "border-error" : "border-base-content/30"
        } bg-base-100`}
      >
        <span
          className={`block rounded-sm transition-all ${
            videoRecording ? "h-7 w-7 bg-error" : "h-12 w-12 rounded-full bg-error/90"
          }`}
        />
      </button>
    );
  }

  if (mode === "burst") {
    return (
      <button
        type="button"
        onPointerDown={onBurstStart}
        onPointerUp={onBurstStop}
        onPointerLeave={onBurstStop}
        aria-label="Burst capture (hold)"
        className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-base-content/30 bg-base-100 active:scale-95"
      >
        <span className="h-12 w-12 rounded-full bg-neutral" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onShoot}
      disabled={busy}
      aria-label="Take photo"
      className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-base-content/30 bg-base-100 active:scale-95 disabled:opacity-60"
    >
      <span className="h-14 w-14 rounded-full bg-neutral" />
    </button>
  );
}

function SessionControls({
  status,
  onPause,
  onResume,
  onEnd
}: {
  status: "live" | "paused";
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={status === "live" ? onPause : onResume}
        className="flex h-12 w-12 items-center justify-center rounded-md border border-base-content/15 bg-base-100 text-base-content/70"
        aria-label={status === "live" ? "Pause session" : "Resume session"}
      >
        {status === "live" ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        onClick={onEnd}
        className="text-[10px] font-semibold uppercase tracking-wider text-base-content/55"
      >
        End
      </button>
    </div>
  );
}

function pickVideoMime(): string {
  const candidates = [
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }
  return "video/webm";
}

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
