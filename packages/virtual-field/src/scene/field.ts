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

/**
 * The dock/pad for a device: parked at the near (headland) edge of the field,
 * lined up with the centre of its assigned block, facing into the field. Both the
 * spawn point and the target of "Return home".
 *
 * `setback` comes from the device spec so different classes park on different pad
 * rows — otherwise a lone rover and a lone drone (which each own the whole field
 * under peer-class partitioning) would spawn inside each other.
 */
export function deviceDock(
  field: FieldConfig,
  ordinal: number,
  count: number,
  setback: number
): { x: number; z: number } {
  const lanes = blockLanes(field, ordinal, count);
  const x = lanes.length
    ? lanes[Math.floor(lanes.length / 2)]
    : (ordinal - (count - 1) / 2) * 4;
  return { x, z: -(rowHalfLength(field) + setback) };
}

/**
 * Survey strips for an aerial device: X centre-lines across its assigned block,
 * spaced by `swath` (its camera's ground footprint at cruise) rather than by crop
 * alleys — a drone doesn't drive between rows. Derived from the same block
 * partition as `blockLanes`, so mixed fleets need no extra partition logic.
 */
export function surveyLanes(
  field: FieldConfig,
  ordinal: number,
  count: number,
  swath: number
): number[] {
  const extent = blockExtent(field, ordinal, count);
  if (!extent || swath <= 0) return [];
  const [minX, maxX] = extent;
  const width = maxX - minX;
  const strips = Math.max(1, Math.round(width / swath));
  const step = width / strips;
  // Centre of each strip, so the outermost passes stay inside the block.
  return Array.from({ length: strips }, (_, i) => minX + step * (i + 0.5));
}

/** The X extent [min, max] a rover's assigned section spans, for the tint overlay. */
export function blockExtent(field: FieldConfig, index: number, count: number): [number, number] | null {
  const block = blockLanes(field, index, count);
  if (block.length === 0) return null;
  const pad = field.rowSpacing / 2;
  return [block[0] - pad, block[block.length - 1] + pad];
}
