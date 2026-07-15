import { Vector3 } from "three";
import type { PerspectiveCamera } from "three";

import type { Crop, CropSpecies, GrowthStage } from "../crop";

// Projects crop entities into the onboard camera to produce 2D bounding boxes —
// the core of synthetic CV-dataset generation. Boxes come straight from the data
// model (position + bounding volume), so every label is exact: no hand-annotation.
// Output boxes are normalised (0..1, y from the top) so the same result drives the
// on-screen overlay and any capture resolution.

export interface Detection {
  id: string; // crop id — lets the AI layer key stable per-plant predictions
  x: number; // left, 0..1
  y: number; // top, 0..1
  w: number;
  h: number;
  species: CropSpecies;
  growthStage: GrowthStage;
  health: number;
  diseased: boolean;
  fruitCount: number;
  distance: number; // metres, camera → plant
}

export interface DetectOptions {
  maxDistance: number;
  maxCount: number;
  /** Minimum normalised box area to keep (drops far specks). */
  minArea: number;
}

const SOIL_TOP = 0.12;
// Reused scratch vectors so a per-frame sweep over thousands of crops allocates
// nothing.
const camPos = new Vector3();
const corner = new Vector3();

export function projectDetections(
  camera: PerspectiveCamera,
  crops: Crop[],
  opts: DetectOptions
): Detection[] {
  camera.updateMatrixWorld();
  camera.getWorldPosition(camPos);

  const out: Detection[] = [];

  for (const c of crops) {
    const cy = SOIL_TOP + c.height / 2;
    const dx = c.x - camPos.x;
    const dy = cy - camPos.y;
    const dz = c.z - camPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > opts.maxDistance) continue;

    const r = c.boundingRadius;
    const yTop = SOIL_TOP + c.height;

    // Project the 8 AABB corners; keep only those in front of the camera.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let anyFront = false;

    for (let i = 0; i < 8; i++) {
      corner.set(
        c.x + (i & 1 ? r : -r),
        i & 2 ? yTop : SOIL_TOP,
        c.z + (i & 4 ? r : -r)
      );
      corner.applyMatrix4(camera.matrixWorldInverse); // → camera space
      if (corner.z >= -0.05) continue; // behind / on the camera (looks down -z)
      anyFront = true;
      corner.applyMatrix4(camera.projectionMatrix); // → NDC (with perspective divide)
      const sx = corner.x * 0.5 + 0.5;
      const sy = 1 - (corner.y * 0.5 + 0.5); // flip: 0 = top
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
    if (!anyFront) continue;

    // Clip to the frame; drop if fully outside or too small.
    const x = Math.max(0, minX);
    const y = Math.max(0, minY);
    const w = Math.min(1, maxX) - x;
    const h = Math.min(1, maxY) - y;
    if (w <= 0 || h <= 0) continue;
    if (w * h < opts.minArea) continue;

    out.push({
      id: c.id,
      x,
      y,
      w,
      h,
      species: c.species,
      growthStage: c.growthStage,
      health: c.health,
      diseased: c.diseased,
      fruitCount: c.fruitCount,
      distance
    });
  }

  // Keep the nearest N so dense fields don't spam thousands of boxes.
  out.sort((a, b) => a.distance - b.distance);
  return out.length > opts.maxCount ? out.slice(0, opts.maxCount) : out;
}
