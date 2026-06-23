// Pure geometry helpers for the field boundary editor. A field's boundary is an
// axis-aligned rectangle defined by a center point + length (N–S) and width
// (E–W) in feet; acreage falls out of length × width. Because the box is
// axis-aligned we can round-trip in both directions — dimensions ⇄ polygon —
// without storing the dimensions separately (they're reconstructed from the
// boundary's bounding box on edit). Client-safe (no DOM / map dependency).

export type Coords = { lat: number; lng: number };
// A GeoJSON Polygon: rings of [lng, lat] pairs. Kept as number[][][] to match
// the FieldSummary/FieldWrite boundary shape in lib/api.ts.
export type GeoJsonPolygon = { type: "Polygon"; coordinates: number[][][] };

// Local flat-earth approximations — fine at field scale (sub-km), where the
// curvature error is far below GPS/operator precision.
const METERS_PER_DEG_LAT = 111_320;
const METERS_PER_FOOT = 0.3048;
const SQFT_PER_ACRE = 43_560;

function metersPerDegLng(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

// Acres for a length × width in feet.
export function acresFromDimensions(lengthFt: number, widthFt: number): number {
  return (lengthFt * widthFt) / SQFT_PER_ACRE;
}

// The four corners of the box, ordered NW, NE, SE, SW — opposite corners are
// always (i + 2) % 4, which the resize handler relies on.
export function boxCorners(center: Coords, lengthFt: number, widthFt: number): [number, number][] {
  const dLat = (lengthFt * METERS_PER_FOOT) / 2 / METERS_PER_DEG_LAT;
  const dLng = (widthFt * METERS_PER_FOOT) / 2 / metersPerDegLng(center.lat);
  return [
    [center.lng - dLng, center.lat + dLat], // NW
    [center.lng + dLng, center.lat + dLat], // NE
    [center.lng + dLng, center.lat - dLat], // SE
    [center.lng - dLng, center.lat - dLat] // SW
  ];
}

// A closed GeoJSON Polygon from the four corners (first point repeated last).
export function boxPolygon(center: Coords, lengthFt: number, widthFt: number): GeoJsonPolygon {
  const corners = boxCorners(center, lengthFt, widthFt);
  return { type: "Polygon", coordinates: [[...corners, corners[0]]] };
}

// New center + dimensions (feet) from a dragged corner and the fixed corner
// diagonally opposite it. abs() keeps things valid even if the user drags a
// corner past its opposite (the box just flips, never inverts).
export function resizeFromCorner(
  dragged: Coords,
  opposite: Coords
): { center: Coords; lengthFt: number; widthFt: number } {
  const center = {
    lat: (dragged.lat + opposite.lat) / 2,
    lng: (dragged.lng + opposite.lng) / 2
  };
  const lengthFt = (Math.abs(dragged.lat - opposite.lat) * METERS_PER_DEG_LAT) / METERS_PER_FOOT;
  const widthFt =
    (Math.abs(dragged.lng - opposite.lng) * metersPerDegLng(center.lat)) / METERS_PER_FOOT;
  return { center, lengthFt, widthFt };
}

// Seed the editor from a stored boundary: recover center + dimensions from the
// rectangle's bounding box. Returns null for a missing/degenerate ring.
export function dimensionsFromBoundary(
  boundary: GeoJsonPolygon | null
): { center: Coords; lengthFt: number; widthFt: number } | null {
  const ring = boundary?.coordinates?.[0];
  if (!ring || ring.length < 4) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const lengthFt = ((maxLat - minLat) * METERS_PER_DEG_LAT) / METERS_PER_FOOT;
  const widthFt = ((maxLng - minLng) * metersPerDegLng(center.lat)) / METERS_PER_FOOT;
  return { center, lengthFt, widthFt };
}
