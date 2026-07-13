import { rowHalfLength } from "./scene/field";
import type { FieldConfig } from "./types";

// Field obstacles — rocks and barrels scattered across the field. They are real
// physics bodies (dynamic Rapier rigidbodies) the rover can push, and their
// positions feed both reactive obstacle-avoidance and the A* planner.

export type ObstacleKind = "rock" | "barrel";

export interface Obstacle {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: ObstacleKind;
}

/** Keep the dock/start area clear so the rover never spawns inside an obstacle. */
const HOME_CLEARANCE = 9;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateObstacles(
  field: FieldConfig,
  count: number,
  seed: number
): Obstacle[] {
  const rng = mulberry32(seed * 104729 + 17);
  const bound = rowHalfLength(field) - 2; // keep them on the drivable field
  const out: Obstacle[] = [];
  let attempts = 0;

  while (out.length < count && attempts < count * 40) {
    attempts += 1;
    const x = (rng() - 0.5) * 2 * bound;
    const z = (rng() - 0.5) * 2 * bound;
    if (Math.hypot(x, z) < HOME_CLEARANCE) continue; // keep the dock clear
    const radius = 0.5 + rng() * 0.7;
    // Don't let obstacles overlap each other.
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.radius + radius + 1)) continue;
    out.push({
      id: `obs-${out.length}`,
      x,
      z,
      radius,
      kind: rng() < 0.5 ? "rock" : "barrel"
    });
  }
  return out;
}
