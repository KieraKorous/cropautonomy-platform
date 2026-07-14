import { rowHalfLength, rowOffsets } from "./scene/field";
import type { FieldConfig } from "./types";

// The crop entity system. This is the PRD's authoritative crop record — every
// plant is a queryable object (id, species, position, growth, health, GPS,
// bounding volume …), not just a rendered blob. The renderer draws *from* these
// records, and later phases (sensor proximity, CV detection) query the same data.

export type CropSpecies =
  | "corn"
  | "wheat"
  | "lettuce"
  | "tomato"
  | "cotton"
  | "vineyard"
  | "almond"
  | "custom";

export type GrowthStage =
  | "seed"
  | "sprout"
  | "juvenile"
  | "mature"
  | "flowering"
  | "fruiting"
  | "harvest"
  | "dead";

export type Weather = "clear" | "cloudy" | "rain" | "fog" | "dust";

/** How a species is drawn — a single mesh, or a canopy on a trunk. */
export type CropGeometry = "cone" | "sphere" | "tree";

export interface SpeciesDef {
  id: CropSpecies;
  label: string;
  geometry: CropGeometry;
  rowSpacing: number; // metres between beds
  plantSpacing: number; // metres between plants along a bed
  matureHeight: number; // metres at the "mature" stage
  canopyRadius: number; // metres — bounding volume at mature
  trunkHeight: number; // metres (tree geometry only)
  foliageHue: number; // base HSL hue for healthy foliage
  hasFruit: boolean;
  fruitPerPlant: number; // typical count when fruiting
}

export interface Crop {
  id: string;
  species: CropSpecies;
  x: number;
  z: number;
  yaw: number; // render rotation
  height: number; // metres
  growthStage: GrowthStage;
  health: number; // 0..1
  moisture: number; // 0..1
  diseased: boolean;
  fruitCount: number;
  boundingRadius: number; // metres
  gps: { lat: number; lon: number };
}

// Ordered lifecycle; STAGE_HEIGHT scales mature height per stage.
export const GROWTH_STAGES: GrowthStage[] = [
  "seed",
  "sprout",
  "juvenile",
  "mature",
  "flowering",
  "fruiting",
  "harvest",
  "dead"
];

const STAGE_HEIGHT: Record<GrowthStage, number> = {
  seed: 0.06,
  sprout: 0.2,
  juvenile: 0.52,
  mature: 1,
  flowering: 1.05,
  fruiting: 1.1,
  harvest: 1.1,
  dead: 0.85
};

export const SPECIES: Record<CropSpecies, SpeciesDef> = {
  corn: {
    id: "corn",
    label: "Corn",
    geometry: "cone",
    rowSpacing: 2.2,
    plantSpacing: 0.9,
    matureHeight: 2.3,
    canopyRadius: 0.34,
    trunkHeight: 0,
    foliageHue: 0.28,
    hasFruit: true,
    fruitPerPlant: 2
  },
  wheat: {
    id: "wheat",
    label: "Wheat",
    geometry: "cone",
    rowSpacing: 2.0,
    plantSpacing: 1.0,
    matureHeight: 1.1,
    canopyRadius: 0.22,
    trunkHeight: 0,
    foliageHue: 0.14,
    hasFruit: false,
    fruitPerPlant: 0
  },
  lettuce: {
    id: "lettuce",
    label: "Lettuce",
    geometry: "sphere",
    rowSpacing: 1.5,
    plantSpacing: 1.0,
    matureHeight: 0.35,
    canopyRadius: 0.28,
    trunkHeight: 0,
    foliageHue: 0.27,
    hasFruit: false,
    fruitPerPlant: 0
  },
  tomato: {
    id: "tomato",
    label: "Tomato",
    geometry: "sphere",
    rowSpacing: 2.0,
    plantSpacing: 1.2,
    matureHeight: 1.0,
    canopyRadius: 0.42,
    trunkHeight: 0,
    foliageHue: 0.3,
    hasFruit: true,
    fruitPerPlant: 12
  },
  cotton: {
    id: "cotton",
    label: "Cotton",
    geometry: "sphere",
    rowSpacing: 2.0,
    plantSpacing: 1.0,
    matureHeight: 1.1,
    canopyRadius: 0.4,
    trunkHeight: 0,
    foliageHue: 0.32,
    hasFruit: true,
    fruitPerPlant: 20
  },
  vineyard: {
    id: "vineyard",
    label: "Vineyard",
    geometry: "tree",
    rowSpacing: 3.0,
    plantSpacing: 1.6,
    matureHeight: 1.9,
    canopyRadius: 0.55,
    trunkHeight: 0.9,
    foliageHue: 0.29,
    hasFruit: true,
    fruitPerPlant: 40
  },
  almond: {
    id: "almond",
    label: "Almond (orchard)",
    geometry: "tree",
    rowSpacing: 6.0,
    plantSpacing: 5.0,
    matureHeight: 4.2,
    canopyRadius: 1.9,
    trunkHeight: 1.5,
    foliageHue: 0.3,
    hasFruit: true,
    fruitPerPlant: 120
  },
  custom: {
    id: "custom",
    label: "Custom",
    geometry: "cone",
    rowSpacing: 2.5,
    plantSpacing: 1.0,
    matureHeight: 1.6,
    canopyRadius: 0.35,
    trunkHeight: 0,
    foliageHue: 0.31,
    hasFruit: false,
    fruitPerPlant: 0
  }
};

// A field is one species; its bed/row geometry follows that species' spacing.
export function fieldForSpecies(size: number, species: CropSpecies): FieldConfig {
  const def = SPECIES[species];
  const rows = Math.max(2, Math.floor(size / def.rowSpacing));
  return { size, rows, rowSpacing: def.rowSpacing };
}

// Deterministic PRNG — same (field, species, stage, seed) always yields the same
// field, so "regenerate" is a reproducible seed bump, not uncontrolled noise.
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

// Synthetic geo-referencing: map field metres to lat/lon off a fixed origin
// (California Central Valley) so every crop carries a plausible GPS fix.
export const GPS_ORIGIN = { lat: 36.58, lon: -120.02 };
const M_PER_DEG_LAT = 111_320;
export function metersToGps(x: number, z: number) {
  const lat = GPS_ORIGIN.lat + -z / M_PER_DEG_LAT;
  const lon =
    GPS_ORIGIN.lon + x / (M_PER_DEG_LAT * Math.cos((GPS_ORIGIN.lat * Math.PI) / 180));
  return { lat, lon };
}

const HEADLAND_MARGIN = 4;
const MAX_CROPS = 9000; // perf ceiling; spacing is widened to stay under it

/**
 * Generate the crop records for a field. Plants sit on the beds (row offsets),
 * skipping the headland ends. Health/moisture/disease/fruit are seeded per plant;
 * height comes from the field-wide growth stage with per-plant variation.
 */
export function generateCrops(
  field: FieldConfig,
  species: CropSpecies,
  stage: GrowthStage,
  seed: number
): Crop[] {
  const def = SPECIES[species];
  const offsets = rowOffsets(field);
  const usable = rowHalfLength(field) - HEADLAND_MARGIN;
  if (usable <= 0) return [];

  // Widen spacing if the naive count would blow the ceiling.
  let spacing = def.plantSpacing;
  const estimate = offsets.length * Math.floor((usable * 2) / spacing);
  if (estimate > MAX_CROPS) spacing *= estimate / MAX_CROPS;

  const perRow = Math.max(1, Math.floor((usable * 2) / spacing));
  const rng = mulberry32(seed * 7919 + offsets.length * 31 + species.length);
  const heightFactor = STAGE_HEIGHT[stage];
  const canFruit = def.hasFruit && (stage === "fruiting" || stage === "harvest");

  const crops: Crop[] = [];
  let n = 0;
  for (const ox of offsets) {
    for (let i = 0; i <= perRow; i++) {
      const z = -usable + (i / perRow) * usable * 2 + (rng() - 0.5) * spacing * 0.3;
      const x = ox + (rng() - 0.5) * def.rowSpacing * 0.12;

      // ~8% of plants are stressed; disease tracks low health (not on dead crop).
      const stressed = rng() < 0.08;
      const health = stage === "dead" ? 0.05 + rng() * 0.1 : stressed ? 0.25 + rng() * 0.2 : 0.72 + rng() * 0.28;
      const diseased = stage !== "dead" && health < 0.4 && rng() < 0.6;

      const height = def.matureHeight * heightFactor * (0.85 + rng() * 0.3);
      const growth = height / def.matureHeight;

      crops.push({
        id: `${species}-${n}`,
        species,
        x,
        z,
        yaw: rng() * Math.PI * 2,
        height,
        growthStage: stage,
        health,
        moisture: 0.3 + rng() * 0.5,
        diseased,
        fruitCount: canFruit ? Math.round(def.fruitPerPlant * (0.5 + rng())) : 0,
        boundingRadius: Math.max(0.1, def.canopyRadius * Math.max(0.35, growth)),
        gps: metersToGps(x, z)
      });
      n += 1;
    }
  }
  return crops;
}
