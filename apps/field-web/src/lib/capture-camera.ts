import { useEffect, useRef, useState } from "react";

// useCameraStream — owns the MediaStream lifecycle. Asks for back-facing camera
// at 1080p when possible; falls back to whatever the browser offers.

export interface UseCameraStreamResult {
  stream: MediaStream | null;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  captureFrame: (mimeType?: string, quality?: number) => Promise<Blob>;
}

export function useCameraStream(): UseCameraStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!("mediaDevices" in navigator)) {
        setError("Camera not available in this browser.");
        return;
      }
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: true
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(mediaStream);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Camera permission denied.");
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  async function captureFrame(
    mimeType = "image/jpeg",
    quality = 0.9
  ): Promise<Blob> {
    const video = videoRef.current;
    if (!video) throw new Error("Video element not mounted.");
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("Camera not ready yet.");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob() returned null."));
        },
        mimeType,
        quality
      );
    });
  }

  return { stream, error, videoRef, captureFrame };
}

export async function blobToThumbnailDataUrl(
  blob: Blob,
  maxSide = 320
): Promise<string> {
  // Decode -> downscale -> JPEG. Bounded under 10KB at this size for typical
  // farm photos. Used as the inline preview in capture.recorded events.
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(maxSide / bitmap.width, maxSide / bitmap.height, 1);
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function nowIso(): string {
  return new Date().toISOString();
}
