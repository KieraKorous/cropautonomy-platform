import type { Crop } from "../crop";
import type { Obstacle } from "../obstacle";

// A uniform spatial hash over everything the rover's ranging sensors can hit —
// crop plants and obstacles, reduced to circles (x, z, radius). Rebuilt only when
// the field/obstacles change; querying returns just the targets near the rover so
// a per-frame LiDAR sweep stays cheap even with thousands of plants.

export interface Target {
  x: number;
  z: number;
  r: number;
}

export interface TargetIndex {
  cell: number;
  buckets: Map<string, Target[]>;
}

export function buildTargetIndex(crops: Crop[], obstacles: Obstacle[], cell: number): TargetIndex {
  const buckets = new Map<string, Target[]>();
  const add = (t: Target) => {
    const key = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(t);
    else buckets.set(key, [t]);
  };
  for (const c of crops) add({ x: c.x, z: c.z, r: c.boundingRadius });
  for (const o of obstacles) add({ x: o.x, z: o.z, r: o.radius });
  return { cell, buckets };
}

/** Targets within `radius` of (x, z) — a small candidate set for ray tests. */
export function queryNearby(index: TargetIndex, x: number, z: number, radius: number): Target[] {
  const span = Math.ceil(radius / index.cell);
  const cx = Math.floor(x / index.cell);
  const cz = Math.floor(z / index.cell);
  const out: Target[] = [];
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const list = index.buckets.get(`${cx + dx},${cz + dz}`);
      if (list) out.push(...list);
    }
  }
  return out;
}
