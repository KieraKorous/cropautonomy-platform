import type { FieldRecord } from "./api.js";

// Small geometry helpers for GPS-assisted field detection. No dependency — a
// ray-casting point-in-polygon over the field boundary rings the API already
// serializes as GeoJSON is all we need to guess which field the phone is in.

export interface LngLat {
  lng: number;
  lat: number;
}

// Ray-casting: is [lng, lat] inside the polygon ring? `ring` is an array of
// [lng, lat] pairs (GeoJSON exterior ring). Points exactly on an edge are
// treated as inside/outside inconsistently — fine for "which field am I in".
export function pointInPolygon(point: LngLat, ring: number[][]): boolean {
  const { lng: x, lat: y } = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// The first field whose boundary contains the point, or null. Only fields with a
// boundary polygon are considered — a field with no drawn boundary can't be
// matched by GPS and stays a manual pick.
export function findFieldAtPoint(
  fields: FieldRecord[],
  point: LngLat
): FieldRecord | null {
  for (const field of fields) {
    const ring = field.boundary?.coordinates?.[0];
    if (!ring || ring.length < 3) continue;
    if (pointInPolygon(point, ring)) return field;
  }
  return null;
}
