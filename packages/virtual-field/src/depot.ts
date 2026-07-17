import type { DeviceSpec } from "./device";
import { rowHalfLength } from "./scene/field";
import type { FieldConfig } from "./types";

// The depot: the field's shed. It houses and charges the whole fleet — ground
// devices park in open-fronted bays inside it, aerial devices land on helipads on
// its roof. It's the target of "Return home" and where every device spawns.
//
// Layout lives here (pure geometry) so the renderer, the docks, and navigation all
// agree on where the bays are.

export const DEPOT = {
  width: 20,
  depth: 10,
  wallHeight: 3.6,
  roofThickness: 0.25,
  /** How far behind the crop rows the shed sits, at the headland. */
  setback: 8,
  /** Bays are inset from the side walls. */
  margin: 1.5
};

/** Top surface of the roof — the deck aerial devices land on. */
export const DEPOT_ROOF_Y = DEPOT.wallHeight + DEPOT.roofThickness;

/** Centre of the shed footprint, at the field's near headland. */
export function depotCenter(field: FieldConfig): { x: number; z: number } {
  return { x: 0, z: -(rowHalfLength(field) + DEPOT.setback) };
}

/** Z of the shed's open front (the side that faces the field). */
export function depotFrontZ(field: FieldConfig): number {
  return depotCenter(field).z + DEPOT.depth / 2;
}

/**
 * The bay for one device: ground devices get a slot inside the shed; aerial
 * devices get a helipad directly above it on the roof. Slots are spread across the
 * shed width by the device's ordinal *within its own class*, so rovers and drones
 * are stacked vertically rather than fighting for floor space.
 *
 * Returns the resting pose — `y` already includes the device's body height above
 * whichever deck it sits on.
 */
export function depotBay(
  field: FieldConfig,
  ordinal: number,
  count: number,
  spec: DeviceSpec
): { x: number; y: number; z: number } {
  const c = depotCenter(field);
  const usable = DEPOT.width - DEPOT.margin * 2;
  const step = usable / Math.max(1, count);
  const x = c.x - usable / 2 + step * (ordinal + 0.5);
  return {
    x,
    y: (spec.flies ? DEPOT_ROOF_Y : 0) + spec.restY,
    z: c.z
  };
}
