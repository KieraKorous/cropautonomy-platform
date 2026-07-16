import type { CropSpecies, GrowthStage, Weather } from "./crop";
import { deviceSpec, type DeviceKind } from "./device";
import type { Obstacle } from "./obstacle";
import { deviceRuntimes } from "./scene/deviceState";
import type { CameraMode, NavMode } from "./store/simStore";
import { useSimStore } from "./store/simStore";
import type { TimeOfDay, Waypoint } from "./types";

// Scenario Manager — the digital-twin save/load format. A scenario is the whole
// world: environment, crop layout, obstacles, fleet poses, and tasks.
//
// Note the crop layout is stored as (species, growthStage, seed), NOT thousands of
// plant records: generateCrops is deterministic, so those three values rebuild the
// exact same field — every plant, its health, disease, and fruit count included.
// That keeps scenarios tiny and diff-able while remaining bit-for-bit reproducible.

// v2 added per-device `kind` + altitude (`y`). v1 files still load: a missing kind
// means a ground rover, and a missing y means its rest height.
export const SCENARIO_VERSION = 2;

export interface DevicePoseSnapshot {
  /** Omitted in v1 scenarios → treated as "gaia_r". */
  kind?: DeviceKind;
  x: number;
  /** Omitted in v1 scenarios → treated as the device's rest height. */
  y?: number;
  z: number;
  heading: number;
  battery: number;
}

export interface Scenario {
  version: number;
  name: string;
  createdAt: string;
  environment: {
    timeOfDay: TimeOfDay;
    weather: Weather;
    showGrid: boolean;
    showRows: boolean;
    showCrops: boolean;
  };
  /** Deterministic seed triple — rebuilds the identical crop layout. */
  field: { species: CropSpecies; growthStage: GrowthStage; seed: number };
  obstacles: Obstacle[];
  fleet: { count: number; active: number; poses: DevicePoseSnapshot[] };
  tasks: { navMode: NavMode; waypoints: Waypoint[]; running: boolean };
  sensors: { showLidar: boolean; sensorNoise: boolean; rtk: boolean; cameraMode: CameraMode };
  vision: { showDetections: boolean; aiRunning: boolean };
}

/** Snapshot the live sim into a scenario. Rover poses come from the render loop. */
export function captureScenario(name = "scenario"): Scenario {
  const s = useSimStore.getState();

  const poses: DevicePoseSnapshot[] = [];
  for (let i = 0; i < s.devices.length; i++) {
    const kind = s.devices[i];
    const rt = deviceRuntimes.get(i);
    poses.push({
      kind,
      x: rt?.x ?? 0,
      y: rt?.y ?? deviceSpec(kind).restY,
      z: rt?.z ?? 0,
      heading: rt?.heading ?? 0,
      battery: s.fleet[i]?.battery ?? 1
    });
  }

  return {
    version: SCENARIO_VERSION,
    name,
    createdAt: new Date().toISOString(),
    environment: {
      timeOfDay: s.timeOfDay,
      weather: s.weather,
      showGrid: s.showGrid,
      showRows: s.showRows,
      showCrops: s.showCrops
    },
    field: { species: s.species, growthStage: s.growthStage, seed: s.seed },
    obstacles: s.obstacles,
    fleet: { count: s.devices.length, active: s.activeDevice, poses },
    tasks: { navMode: s.navMode, waypoints: s.waypoints, running: s.running },
    sensors: {
      showLidar: s.showLidar,
      sensorNoise: s.sensorNoise,
      rtk: s.rtk,
      cameraMode: s.cameraMode
    },
    vision: { showDetections: s.showDetections, aiRunning: s.aiRunning }
  };
}

export function downloadScenario(scenario: Scenario) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${scenario.name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parse + shape-check a scenario file. Returns null if it isn't one. */
export function parseScenario(text: string): Scenario | null {
  try {
    const j = JSON.parse(text) as Partial<Scenario>;
    if (!j || typeof j !== "object") return null;
    if (!j.field || !j.fleet || !j.environment) return null;
    return j as Scenario;
  } catch {
    return null;
  }
}
