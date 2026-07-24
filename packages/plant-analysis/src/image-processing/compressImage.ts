import { drawToBlob, scaleToFit } from "./canvas";

// Client-side image compression before storage (PRD §10.16). IndexedDB space is
// limited, so downscale to a max dimension and re-encode as JPEG. Browser-only.

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: string;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function compressImage(
  source: Blob,
  opts: CompressOptions = {}
): Promise<CompressedImage> {
  const { maxDimension = 1280, quality = 0.72, mimeType = "image/jpeg" } = opts;
  // `from-image` bakes EXIF orientation into the pixels so stored images aren't sideways.
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxDimension);
    const blob = await drawToBlob(bitmap, width, height, mimeType, quality);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
