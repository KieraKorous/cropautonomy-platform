import type { Weather } from "../crop";
import type { TimeOfDay } from "../types";

// Per-time-of-day lighting + atmosphere presets. Kept asset-free on purpose: sky
// is drei's procedural <Sky> shader and fog is solid colour, so the sim has no
// network dependency (no HDR fetch) and honours the portal's CSP. Palette leans
// industrial/agricultural/calm per the CropAutonomy design posture — muted, not
// candy-coloured.

export interface EnvPreset {
  /** drei <Sky> sun position (normalized direction-ish vector). */
  sunPosition: [number, number, number];
  /** Directional (sun) light world position. */
  lightPosition: [number, number, number];
  sunIntensity: number;
  ambientIntensity: number;
  hemiIntensity: number;
  /** Fog colour + linear near/far. */
  fog: { color: string; near: number; far: number };
  /** Canvas clear / horizon tint behind the sky. */
  background: string;
  /** Ground diffuse colour (soil). */
  soil: string;
}

export const ENV_PRESETS: Record<TimeOfDay, EnvPreset> = {
  dawn: {
    sunPosition: [-1, 0.12, 2],
    lightPosition: [-40, 24, 60],
    sunIntensity: 1.1,
    ambientIntensity: 0.35,
    hemiIntensity: 0.5,
    fog: { color: "#c9b8a3", near: 40, far: 220 },
    background: "#d8c6ad",
    soil: "#6b5842"
  },
  day: {
    sunPosition: [8, 6, 4],
    lightPosition: [60, 80, 40],
    sunIntensity: 1.9,
    ambientIntensity: 0.45,
    hemiIntensity: 0.7,
    fog: { color: "#cdd7d1", near: 60, far: 300 },
    background: "#bcc9c2",
    soil: "#5c4a35"
  },
  dusk: {
    sunPosition: [-2, 0.08, -3],
    lightPosition: [-70, 20, -30],
    sunIntensity: 1.0,
    ambientIntensity: 0.3,
    hemiIntensity: 0.4,
    fog: { color: "#a08a86", near: 35, far: 200 },
    background: "#8f7b76",
    soil: "#4a3c2c"
  },
  night: {
    sunPosition: [0, -0.6, -1],
    lightPosition: [-30, 50, -40],
    sunIntensity: 0.18,
    ambientIntensity: 0.18,
    hemiIntensity: 0.25,
    fog: { color: "#1a2230", near: 30, far: 160 },
    background: "#0e141d",
    soil: "#2c2a28"
  }
};

/**
 * How much sun the panels are getting, 0–1, relative to clear midday.
 *
 * Derived from the *same* effective sun intensity that lights the scene, so the
 * energy model and the visuals can't disagree: if it looks dark out, the devices
 * really are charging slowly. Night ≈ 0.09, rain ≈ 0.3, clear day = 1.
 */
export function solarFactor(t: TimeOfDay, w: Weather): number {
  const sun = applyWeather(ENV_PRESETS[t], w).sunIntensity;
  return Math.max(0, Math.min(1, sun / ENV_PRESETS.day.sunIntensity));
}

// Layer a weather condition over the time-of-day base: weather dims the sun,
// thickens/colours the fog, and tints the sky. Kept as a pure transform of the
// preset so Lighting/Ground/Scene stay weather-agnostic — they just consume the
// adjusted preset. Rain/dust *particles* are separate (see Weather.tsx).
export function applyWeather(p: EnvPreset, w: Weather): EnvPreset {
  switch (w) {
    case "clear":
      return p;
    case "cloudy":
      return {
        ...p,
        sunIntensity: p.sunIntensity * 0.45,
        ambientIntensity: p.ambientIntensity * 1.15,
        hemiIntensity: p.hemiIntensity * 1.1,
        fog: { ...p.fog, far: p.fog.far * 0.8 }
      };
    case "rain":
      return {
        ...p,
        sunIntensity: p.sunIntensity * 0.32,
        ambientIntensity: p.ambientIntensity * 0.95,
        fog: { color: "#6b7480", near: p.fog.near * 0.55, far: p.fog.far * 0.45 },
        background: "#6b7480"
      };
    case "fog":
      return {
        ...p,
        sunIntensity: p.sunIntensity * 0.55,
        fog: { color: "#ccd3d4", near: 6, far: 68 },
        background: "#ccd3d4"
      };
    case "dust":
      return {
        ...p,
        sunIntensity: p.sunIntensity * 0.7,
        ambientIntensity: p.ambientIntensity * 1.05,
        fog: { color: "#c7a26a", near: 14, far: 120 },
        background: "#c19a5f"
      };
  }
}
