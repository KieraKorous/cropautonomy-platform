// Geometry for the farm card map preview. We render a Mapbox *static image* (one
// cheap <img>, no WebGL) but the Static Images API can't draw text labels — so we
// compute the viewport ourselves (center + zoom that fits the farm's fields) and
// project each field's label point to a percentage position, letting the card
// overlay real HTML labels on top of the image. Web-Mercator math, 512px tiles.

export type Coords = { lat: number; lng: number };
export type LngLat = [number, number];

const TILE = 512;

// Project lng/lat to "world" pixels at zoom 0 (the 512×512 Mercator square).
function toWorld(lng: number, lat: number): { x: number; y: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * TILE,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE
  };
}

function worldYToLat(y: number): number {
  const n = Math.PI - (2 * Math.PI * y) / TILE;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export type Viewport = { centerLng: number; centerLat: number; zoom: number };

// The center + zoom that fits all points into a w×h image with `pad` px of margin.
// Degenerate (single point) input falls back to a sensible close zoom.
export function fitViewport(
  points: LngLat[],
  w: number,
  h: number,
  pad: number
): Viewport {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const nw = toWorld(minLng, maxLat);
  const se = toWorld(maxLng, minLat);
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = worldYToLat((nw.y + se.y) / 2);

  const worldW = se.x - nw.x;
  const worldH = se.y - nw.y;
  // No meaningful extent (one point) — frame it at a close, readable zoom.
  if (worldW < 1e-7 && worldH < 1e-7) {
    return { centerLng, centerLat, zoom: 13 };
  }

  const availW = Math.max(w - 2 * pad, 1);
  const availH = Math.max(h - 2 * pad, 1);
  const zoomX = worldW > 1e-9 ? Math.log2(availW / worldW) : 20;
  const zoomY = worldH > 1e-9 ? Math.log2(availH / worldH) : 20;
  const zoom = Math.max(1, Math.min(16, Math.min(zoomX, zoomY)));
  return { centerLng, centerLat, zoom };
}

// Project a point to a percentage position within the image (for absolute HTML
// overlay placement). Returns null when it falls outside the frame.
export function projectToPercent(
  lng: number,
  lat: number,
  view: Viewport,
  w: number,
  h: number
): { leftPct: number; topPct: number } | null {
  const scale = Math.pow(2, view.zoom);
  const p = toWorld(lng, lat);
  const c = toWorld(view.centerLng, view.centerLat);
  const x = w / 2 + (p.x - c.x) * scale;
  const y = h / 2 + (p.y - c.y) * scale;
  if (x < 0 || x > w || y < 0 || y > h) return null;
  return { leftPct: (x / w) * 100, topPct: (y / h) * 100 };
}

// A field's label anchor: its centroid, else the center of its boundary box.
export function labelPoint(
  centroid: { coordinates: [number, number] } | null,
  boundary: { coordinates: number[][][] } | null
): Coords | null {
  if (centroid) return { lng: centroid.coordinates[0], lat: centroid.coordinates[1] };
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
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}
