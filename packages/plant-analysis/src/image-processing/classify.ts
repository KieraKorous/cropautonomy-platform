import type { PlantColorAnalysis } from "../types";

// Pure pixel-classification heuristics (no DOM) so the color logic is unit-testable
// without a canvas. These are deliberately simple HSV thresholds — supporting
// evidence, never a diagnosis (PRD §10.17).

export type PixelClass = "green" | "yellow" | "brown" | "other";

export interface Hsv {
  /** hue in [0, 360) */
  h: number;
  /** saturation in [0, 1] */
  s: number;
  /** value in [0, 1] */
  v: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

/** Buckets a pixel into plant-material color classes, or "other" (background/soil/gray). */
export function classifyPixel(r: number, g: number, b: number): PixelClass {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.12) return "other"; // too dark to judge
  if (s < 0.18) return "other"; // gray / white / washed-out background
  if (h >= 65 && h <= 170) return "green"; // yellow-green through green
  if (h >= 40 && h < 65) return "yellow";
  if (h >= 12 && h < 40) return v < 0.55 ? "brown" : "yellow"; // dark warm = brown, bright warm = yellow/orange
  return "other";
}

/** Aggregates a flat RGBA buffer into class percentages. Pure — feed it ImageData.data. */
export function analyzePixels(data: Uint8ClampedArray): PlantColorAnalysis {
  let green = 0;
  let yellow = 0;
  let brown = 0;
  let other = 0;
  let total = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 16) continue; // fully transparent — not part of the image
    total += 1;
    switch (classifyPixel(data[i], data[i + 1], data[i + 2])) {
      case "green":
        green += 1;
        break;
      case "yellow":
        yellow += 1;
        break;
      case "brown":
        brown += 1;
        break;
      default:
        other += 1;
    }
  }

  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  const greenPercent = pct(green);
  const yellowPercent = pct(yellow);
  const brownPercent = pct(brown);
  return {
    greenPercent,
    yellowPercent,
    brownPercent,
    otherPercent: pct(other),
    vegetationCoveragePercent: Math.round((greenPercent + yellowPercent + brownPercent) * 10) / 10,
    sampledPixels: total
  };
}
