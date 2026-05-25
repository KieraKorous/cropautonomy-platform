import { Navigate, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";

import { OverlayChrome } from "../components/OverlayChrome.js";
import { SurfaceSwitcher } from "../components/SurfaceSwitcher.js";
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

// Full-bleed camera + floating overlay controls. Same pattern as the native
// camera app and Instagram/Snapchat — viewfinder fills the screen, all chrome
// floats. Status (connectivity, GPS, battery) + account live in the top
// OverlayChrome; mode + shutter + session controls + library float at the
// bottom; the SurfaceSwitcher is the very-bottom-center toggle to /map.

type Mode = "photo" | "burst" | "video";

export function CapturePage() {
    const navigate = useNavigate();
    const { user } = useUser();
    const { session, loading: sessionLoading, pause, resume, end } = useActiveSession();
    const { stream, videoRef, captureFrame, error } = useCameraStream();
    const gps = useGps(true);
    const [mode, setMode] = useState<Mode>("photo");
    const [queueCount, setQueueCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [videoRecording, setVideoRecording] = useState(false);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const videoChunksRef = useRef<Blob[]>([]);
    const burstAbortRef = useRef<{ aborted: boolean } | null>(null);
    const libraryInputRef = useRef<HTMLInputElement | null>(null);

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

    if (sessionLoading) {
        // Don't decide where to go until the IndexedDB session lookup resolves;
        // a premature Navigate while loading caused a redirect loop with /.
        return (
            <div className="grid h-full place-items-center bg-black text-sm text-white/55">
                Loading…
            </div>
        );
    }
    if (!session) {
        return <Navigate to="/" replace />;
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
                const thumb =
                    index === 0
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
        // Add an audio track on demand; mic isn't requested at camera init so
        // photo-only users aren't gated on mic permission. If the user denies
        // mic here we still record silent video rather than failing.
        if (!stream.getAudioTracks().length) {
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({
                    audio: true
                });
                micStream.getAudioTracks().forEach((track) => stream.addTrack(track));
            } catch {
                /* mic denied — record video silently */
            }
        }
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

    async function handleLibraryFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setBusy(true);
        try {
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
                    sessionId: session!.sessionId,
                    orgId: session!.orgId,
                    farmId: session!.farmId,
                    fieldId: session!.fieldId,
                    cropTypeId: session!.cropTypeId,
                    source: "field_capture_pwa",
                    mediaType: isVideo ? "video" : "photo",
                    mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
                    sizeBytes: file.size,
                    capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
                    location,
                    thumbnailDataUrl: thumb,
                    blob: file
                });
            }
            kickUploadWorker();
        } finally {
            setBusy(false);
            // Reset so picking the same file again still fires onChange.
            if (libraryInputRef.current) libraryInputRef.current.value = "";
        }
    }

    return (
        <div className="relative h-full bg-black">
            {error ? (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">
                    <div>
                        <p className="text-base font-semibold text-white">Camera unavailable</p>
                        <p className="mt-1 text-xs">{error}</p>
                    </div>
                </div>
            ) : (
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}

            {videoRecording && (
                <div className="safe-top pointer-events-none fixed left-1/2 top-12 z-30 -translate-x-1/2 px-3">
                    <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-error/85 px-3 py-1 text-xs font-semibold text-error-content shadow-lg">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-error-content" />
                        Recording
                    </span>
                </div>
            )}

            <OverlayChrome
                variant="dark"
                queueCount={queueCount}
                sessionStatus={session.status}
            />

            {/* Bottom overlay: mode switcher + shutter row + surface switcher.
          Three stacked rows, all floating, safe-area aware. */}
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-4 pb-3 safe-bottom">
                <ModeSwitcher
                    mode={mode}
                    onChange={setMode}
                    disabled={busy || videoRecording}
                />

                <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-6 px-2 mb-4">
                    <LibraryButton
                        onClick={() => libraryInputRef.current?.click()}
                        disabled={busy || videoRecording}
                    />
                    <CaptureButton
                        mode={mode}
                        busy={busy || !stream}
                        videoRecording={videoRecording}
                        onShoot={shootPhoto}
                        onBurstStart={runBurst}
                        onBurstStop={stopBurst}
                        onVideoToggle={toggleVideo}
                    />
                    <SessionControls
                        status={session.status}
                        onPause={pause}
                        onResume={resume}
                        onEnd={async () => {
                            await end();
                            navigate("/", { replace: true });
                        }}
                    />
                </div>

                <SurfaceSwitcherSpacer />
            </div>

            <SurfaceSwitcher variant="dark" />

            <input
                ref={libraryInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => void handleLibraryFiles(e.currentTarget.files)}
            />
        </div>
    );
}

// Reserves vertical room equal to the SurfaceSwitcher's height so the shutter
// row doesn't overlap it. SurfaceSwitcher is its own fixed element rendered
// outside this column, so we add a transparent placeholder here.
function SurfaceSwitcherSpacer() {
    return <div className="h-14" aria-hidden />;
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
        <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full bg-black/45 p-1 backdrop-blur-md">
            {modes.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(m.id)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${mode === m.id
                            ? "bg-white text-neutral"
                            : "text-white/75 hover:text-white"
                        }`}
                >
                    {m.label}
                </button>
            ))}
        </div>
    );
}

function LibraryButton({
    onClick,
    disabled
}: {
    onClick: () => void;
    disabled: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label="Upload from library"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md disabled:opacity-50"
        >
            <LibraryIcon />
        </button>
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
                className={`relative flex h-20 w-20 items-center justify-center rounded-full border-4 ${videoRecording ? "border-error" : "border-white"
                    }`}
            >
                <span
                    className={`block transition-all ${videoRecording
                            ? "h-7 w-7 rounded-sm bg-error"
                            : "h-14 w-14 rounded-full bg-error/90"
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
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white active:scale-95"
            >
                <span className="h-14 w-14 rounded-full bg-white" />
            </button>
        );
    }
    return (
        <button
            type="button"
            onClick={onShoot}
            disabled={busy}
            aria-label="Take photo"
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white active:scale-95 disabled:opacity-60"
        >
            <span className="h-16 w-16 rounded-full bg-white" />
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
        <div className="flex flex-col items-center gap-1.5">
            <button
                type="button"
                onClick={status === "live" ? onPause : onResume}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md"
                aria-label={status === "live" ? "Pause session" : "Resume session"}
            >
                {status === "live" ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
                type="button"
                onClick={onEnd}
                className="text-[10px] font-semibold uppercase tracking-wider text-white/80 hover:text-white"
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

function LibraryIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
            <path d="m21 15-5-5L5 21" />
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
