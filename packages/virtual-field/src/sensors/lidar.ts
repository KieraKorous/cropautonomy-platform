import { queryNearby, type TargetIndex } from "./targetIndex";

// Analytic 2D LiDAR. Rather than raycast meshes, we intersect each ray against
// the target circles from the spatial index (ray-vs-circle) — fast, and it works
// straight off the crop/obstacle data model. Optional gaussian range noise and
// random dropout model a real sensor. heading 0 = +Z; ray angle a has direction
// (sin a, cos a), matching the rover's forward convention.

export interface LidarRay {
  angle: number;
  dist: number;
  hit: boolean;
}

export interface LidarResult {
  rays: LidarRay[];
  /** Nearest return over the whole sweep (m), or null if nothing in range. */
  nearest: number | null;
  /** Nearest return within a narrow forward cone (the "ultrasonic"), or null. */
  forward: number | null;
}

export interface LidarOptions {
  rayCount: number;
  maxRange: number;
  noise: boolean;
  /** 0..1 probability a given ray returns nothing. */
  dropout: number;
  /** Half-angle (rad) of the forward cone used for the ultrasonic reading. */
  forwardCone: number;
  rng?: () => number;
}

// Standard normal via Box–Muller.
function gaussian(rng: () => number) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function lidarScan(
  index: TargetIndex,
  x: number,
  z: number,
  heading: number,
  opts: LidarOptions
): LidarResult {
  const rng = opts.rng ?? Math.random;
  const candidates = queryNearby(index, x, z, opts.maxRange);
  const rays: LidarRay[] = [];
  let nearest: number | null = null;
  let forward: number | null = null;

  for (let i = 0; i < opts.rayCount; i++) {
    const angle = (i / opts.rayCount) * Math.PI * 2;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);

    // Nearest ray-circle intersection among candidates.
    let best = opts.maxRange;
    let hitAny = false;
    for (const t of candidates) {
      const ocx = x - t.x;
      const ocz = z - t.z;
      const b = ocx * dirX + ocz * dirZ;
      const c = ocx * ocx + ocz * ocz - t.r * t.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let tt = -b - sq;
      if (tt < 0) tt = -b + sq; // ray origin inside the circle
      if (tt >= 0 && tt < best) {
        best = tt;
        hitAny = true;
      }
    }

    let dist = best;
    let hit = hitAny;
    if (hit && opts.dropout > 0 && rng() < opts.dropout) hit = false; // random dropout
    if (hit && opts.noise) dist = Math.max(0, dist + gaussian(rng) * 0.04);

    rays.push({ angle, dist, hit });

    if (hit) {
      if (nearest === null || dist < nearest) nearest = dist;
      // Forward cone → ultrasonic. Shortest signed angle between ray and heading.
      const rel = Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading));
      if (Math.abs(rel) <= opts.forwardCone && (forward === null || dist < forward)) {
        forward = dist;
      }
    }
  }

  return { rays, nearest, forward };
}
