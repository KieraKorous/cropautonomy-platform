import type { FieldConfig } from "../types";

// Single source of truth for where crop rows sit, so the rendered furrows
// (Ground) and the robot's navigation (Robot) can never disagree. Rows run along
// Z at discrete X offsets, centred on the origin.

/** X centre-line of each row, left-to-right, centred on x=0. */
export function rowOffsets(field: FieldConfig): number[] {
  const span = (field.rows - 1) * field.rowSpacing;
  return Array.from({ length: field.rows }, (_, i) => i * field.rowSpacing - span / 2);
}

/** Half the drivable length of a row along Z (rows span [-half, +half]). */
export function rowHalfLength(field: FieldConfig): number {
  return Math.min(field.size * 0.9, field.size - 8) / 2;
}

/**
 * X centre-lines of the alleys *between* crop rows — where the rover drives so it
 * inspects rows without running over the plants sitting on the beds. There is one
 * fewer lane than rows; a single-row field falls back to driving the row itself.
 */
export function driveLanes(field: FieldConfig): number[] {
  const offsets = rowOffsets(field);
  if (offsets.length < 2) return offsets;
  const lanes: number[] = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    lanes.push((offsets[i] + offsets[i + 1]) / 2);
  }
  return lanes;
}

/**
 * The drive-lanes assigned to rover `index` of a `count`-rover fleet: a
 * contiguous block, so each rover works its own spatially-separated region of the
 * field (coordinated coverage). An index with no lanes left just idles.
 */
export function blockLanes(field: FieldConfig, index: number, count: number): number[] {
  const lanes = driveLanes(field);
  if (count <= 1) return lanes;
  const per = Math.ceil(lanes.length / count);
  return lanes.slice(index * per, index * per + per);
}
