import type { Weather } from "../crop";
import { solarFactor } from "../scene/environment";
import type { TimeOfDay } from "../types";

// Simulated soil + microclimate readings for a GAIA-S sensor station.
//
// Like solarFactor(), these are derived from the *same* environment the scene shows
// — time of day and weather — so a rainy night really does read cold, wet and near
// saturated, while a clear noon reads warm and drying. Per-station variation comes
// from its deployed position, so two stations in one field disagree a little, as
// real probes would. Deterministic given (time, weather, x, z, elapsed); optional
// gaussian noise + drift mirror the ranging-sensor model in Sensors.tsx.

export interface StationReadout {
  /** Volumetric soil water content, 0–1. */
  soilMoisture: number;
  soilTempC: number;
  airTempC: number;
  /** Relative humidity, 0–1. */
  humidity: number;
  /** Leaf wetness, 0–1 — the disease-pressure proxy the agronomy layer cares about. */
  leafWetness: number;
  /** Photosynthetically active radiation, µmol·m⁻²·s⁻¹ (0 at night). */
  par: number;
}

// Diurnal baselines. Air swings hard across the day; humidity runs opposite it.
const AIR_BASE: Record<TimeOfDay, number> = { dawn: 12, day: 24, dusk: 17, night: 9 };
const HUMIDITY_BASE: Record<TimeOfDay, number> = {
  dawn: 0.8,
  day: 0.5,
  dusk: 0.68,
  night: 0.86
};

interface WeatherShift {
  air: number;
  humidity: number;
  wetness: number;
  moisture: number;
}
// How each condition pushes the readings. Rain is cold, wet, and recharges the soil;
// dust is hot and drying; fog is cool and near-saturated at the leaf.
const WEATHER: Record<Weather, WeatherShift> = {
  clear: { air: 1.5, humidity: -0.08, wetness: 0.0, moisture: -0.03 },
  cloudy: { air: -1.5, humidity: 0.06, wetness: 0.05, moisture: 0.0 },
  rain: { air: -4, humidity: 0.3, wetness: 0.75, moisture: 0.28 },
  fog: { air: -2.5, humidity: 0.35, wetness: 0.55, moisture: 0.08 },
  dust: { air: 2.5, humidity: -0.18, wetness: 0.0, moisture: -0.06 }
};

// Cheap deterministic hash of a position → 0–1, for stable per-station offsets.
function posHash(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function microclimate(
  time: TimeOfDay,
  weather: Weather,
  x: number,
  z: number,
  elapsed: number,
  noise: boolean
): StationReadout {
  const w = WEATHER[weather];
  const h = posHash(x, z);
  const sun = solarFactor(time, weather);

  // A slow wobble so a held reading drifts gently rather than sitting dead-flat.
  const wobble = Math.sin(elapsed * 0.05 + h * 6.28);

  const airTempC = AIR_BASE[time] + w.air + (h - 0.5) * 2 + wobble * 0.6;
  // Soil damps and lags the air: it's the warmer floor at night, the cooler one by day.
  const soilTempC = airTempC * 0.55 + 7.5 + (h - 0.5) * 1.5;
  const humidity = clamp01(HUMIDITY_BASE[time] + w.humidity + (h - 0.5) * 0.06 - sun * 0.12);
  // Baseline moisture per station, recharged by wet weather and dried by strong sun.
  const soilMoisture = clamp01(0.34 + (h - 0.5) * 0.22 + w.moisture - sun * 0.05);
  const leafWetness = clamp01(w.wetness + humidity * 0.2 - sun * 0.15 + (h - 0.5) * 0.05);
  const par = sun * 2000; // clear-noon ≈ 2000 µmol·m⁻²·s⁻¹

  const jitter = (v: number, scale: number) =>
    noise ? v + (Math.random() - 0.5) * scale : v;

  return {
    soilMoisture: clamp01(jitter(soilMoisture, 0.01)),
    soilTempC: jitter(soilTempC, 0.15),
    airTempC: jitter(airTempC, 0.2),
    humidity: clamp01(jitter(humidity, 0.01)),
    leafWetness: clamp01(jitter(leafWetness, 0.01)),
    par: Math.max(0, Math.round(jitter(par, 20)))
  };
}
