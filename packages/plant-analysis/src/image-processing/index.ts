// Non-AI image processing (PRD §10.17, §11). Browser-only — the canvas functions
// touch the DOM. Import from "@gaia/plant-analysis/image-processing" inside a
// client boundary. The pure classifier is exported too, for reuse/testing.

export { compressImage, type CompressOptions, type CompressedImage } from "./compressImage";
export { analyzePlantColors } from "./analyzePlantColors";
export {
  classifyPixel,
  analyzePixels,
  rgbToHsv,
  type PixelClass,
  type Hsv
} from "./classify";
