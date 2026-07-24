import type { PlantColorAnalysis } from "../types";
import { drawToImageData, scaleToFit } from "./canvas";
import { analyzePixels } from "./classify";

// Non-AI color analysis (PRD §10.17, §11). Downsamples the image and buckets
// pixels into green/yellow/brown/other via HSV thresholds. Browser-only (canvas);
// the pixel math lives in the pure `analyzePixels` so it can be unit-tested.
//
// The sample is small (≤ ~200px) so this runs fast on the main thread; a Web
// Worker is only needed if we later analyze full-resolution frames in bulk.

export async function analyzePlantColors(
  source: Blob,
  opts: { sampleMax?: number } = {}
): Promise<PlantColorAnalysis> {
  const { sampleMax = 200 } = opts;
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, sampleMax);
    const imageData = drawToImageData(bitmap, width, height);
    return analyzePixels(imageData.data);
  } finally {
    bitmap.close();
  }
}
