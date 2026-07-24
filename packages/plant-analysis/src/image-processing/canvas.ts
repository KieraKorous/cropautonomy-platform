// Small canvas helpers shared by compress + color analysis. Browser-only:
// OffscreenCanvas where available (works off the main thread / in workers),
// falling back to a detached <canvas> element. Kept in one place so the DOM
// surface is isolated from the pure logic.

interface Surface {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toBlob: (mimeType: string, quality?: number) => Promise<Blob>;
}

function makeSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    return {
      ctx,
      toBlob: (mimeType, quality) => canvas.convertToBlob({ type: mimeType, quality })
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return {
    ctx,
    toBlob: (mimeType, quality) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
          mimeType,
          quality
        )
      )
  };
}

/** Draws a bitmap scaled to width×height and returns an encoded Blob. */
export async function drawToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mimeType: string,
  quality: number
): Promise<Blob> {
  const surface = makeSurface(width, height);
  surface.ctx.drawImage(bitmap, 0, 0, width, height);
  return surface.toBlob(mimeType, quality);
}

/** Draws a bitmap scaled to width×height and returns its raw RGBA pixels. */
export function drawToImageData(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const surface = makeSurface(width, height);
  surface.ctx.drawImage(bitmap, 0, 0, width, height);
  return surface.ctx.getImageData(0, 0, width, height);
}

/** Fits (w, h) within a max dimension, never upscaling. */
export function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
