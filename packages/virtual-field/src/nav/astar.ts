import type { Obstacle } from "../obstacle";
import { rowHalfLength } from "../scene/field";
import type { FieldConfig, Waypoint } from "../types";

// Grid A* path planner used by "return home" (and any goal-directed nav). The
// field is discretised into cells; cells within (obstacle radius + rover radius)
// of any obstacle are blocked. The raw grid path is then string-pulled with
// line-of-sight checks so the rover follows a few smooth waypoints, not a
// staircase. Runs on demand (a button press), so a simple search is plenty.

const CELL = 2; // metres per grid cell
const ROVER_RADIUS = 1.15; // obstacle inflation so the body clears them

interface Grid {
  cols: number;
  min: number;
  blocked: (cx: number, cz: number) => boolean;
  toWorld: (c: number) => number;
  toCell: (v: number) => number;
}

function makeGrid(field: FieldConfig, obstacles: Obstacle[]): Grid {
  const half = rowHalfLength(field);
  const min = -half;
  const cols = Math.max(2, Math.round((half * 2) / CELL) + 1);
  const toWorld = (c: number) => min + c * CELL;
  const toCell = (v: number) => Math.min(cols - 1, Math.max(0, Math.round((v - min) / CELL)));
  const blocked = (cx: number, cz: number) => {
    const wx = toWorld(cx);
    const wz = toWorld(cz);
    for (const o of obstacles) {
      if (Math.hypot(o.x - wx, o.z - wz) < o.radius + ROVER_RADIUS) return true;
    }
    return false;
  };
  return { cols, min, blocked, toWorld, toCell };
}

// True if the straight segment a→b stays clear of every (inflated) obstacle.
function lineOfSight(ax: number, az: number, bx: number, bz: number, obstacles: Obstacle[]) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / (CELL * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const o of obstacles) {
      if (Math.hypot(o.x - x, o.z - z) < o.radius + ROVER_RADIUS) return false;
    }
  }
  return true;
}

export function planPath(
  field: FieldConfig,
  obstacles: Obstacle[],
  start: Waypoint,
  goal: Waypoint
): Waypoint[] {
  const grid = makeGrid(field, obstacles);
  const { cols } = grid;
  const idx = (cx: number, cz: number) => cz * cols + cx;

  const startC = { x: grid.toCell(start.x), z: grid.toCell(start.z) };
  let goalC = { x: grid.toCell(goal.x), z: grid.toCell(goal.z) };

  // If the goal cell is blocked, snap to the nearest free cell.
  if (grid.blocked(goalC.x, goalC.z)) {
    let best = Infinity;
    let found = goalC;
    for (let cz = 0; cz < cols; cz++) {
      for (let cx = 0; cx < cols; cx++) {
        if (grid.blocked(cx, cz)) continue;
        const d = Math.hypot(cx - goalC.x, cz - goalC.z);
        if (d < best) {
          best = d;
          found = { x: cx, z: cz };
        }
      }
    }
    goalC = found;
  }

  const n = cols * cols;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new Set<number>();

  const h = (cx: number, cz: number) => Math.hypot(cx - goalC.x, cz - goalC.z);
  const startIdx = idx(startC.x, startC.z);
  gScore[startIdx] = 0;
  open.add(startIdx);

  const NEIGHBORS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  let goalIdx = idx(goalC.x, goalC.z);
  let reached = false;

  while (open.size > 0) {
    // Pick the open node with the lowest f = g + h.
    let current = -1;
    let bestF = Infinity;
    for (const i of open) {
      const cx = i % cols;
      const cz = (i / cols) | 0;
      const f = gScore[i] + h(cx, cz);
      if (f < bestF) {
        bestF = f;
        current = i;
      }
    }
    if (current === goalIdx) {
      reached = true;
      break;
    }
    open.delete(current);
    closed[current] = 1;

    const cx = current % cols;
    const cz = (current / cols) | 0;
    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= cols) continue;
      if (grid.blocked(nx, nz)) continue;
      // No diagonal corner-cutting through a blocked orthogonal neighbour.
      if (dx !== 0 && dz !== 0 && (grid.blocked(cx + dx, cz) || grid.blocked(cx, cz + dz))) {
        continue;
      }
      const ni = idx(nx, nz);
      if (closed[ni]) continue;
      const step = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1;
      const tentative = gScore[current] + step;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        cameFrom[ni] = current;
        open.add(ni);
      }
    }
  }

  if (!reached) return [goal]; // best-effort: head straight for it

  // Reconstruct grid path (goal → start), then reverse.
  const cells: number[] = [];
  for (let i = goalIdx; i !== -1; i = cameFrom[i]) cells.push(i);
  cells.reverse();

  const worldPts = cells.map((i) => ({
    x: grid.toWorld(i % cols),
    z: grid.toWorld((i / cols) | 0)
  }));
  // Pin the exact goal on the end.
  worldPts[worldPts.length - 1] = { x: goal.x, z: goal.z };

  // String-pulling: from each anchor, reach as far as line-of-sight allows.
  const smoothed: Waypoint[] = [];
  let anchor = { x: start.x, z: start.z };
  let i = 1;
  while (i < worldPts.length) {
    if (i === worldPts.length - 1 || !lineOfSight(anchor.x, anchor.z, worldPts[i + 1].x, worldPts[i + 1].z, obstacles)) {
      smoothed.push(worldPts[i]);
      anchor = worldPts[i];
    }
    i += 1;
  }
  return smoothed;
}
