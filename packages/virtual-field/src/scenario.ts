import type { CropSpecies, GrowthStage, Weather } from "./crop";
import type { Obstacle } from "./obstacle";
import { roverRuntimes } from "./scene/roverState";
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

export const SCENARIO_VERSION = 1;

export interface RoverPoseSnapshot {
  x: number;
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
  fleet: { count: number; active: number; poses: RoverPoseSnapshot[] };
  tasks: { navMode: NavMode; waypoints: Waypoint[]; running: boolean };
  sensors: { showLidar: boolean; sensorNoise: boolean; rtk: boolean; cameraMode: CameraMode };
  vision: { showDetections: boolean; aiRunning: boolean };
}

/** Snapshot the live sim into a scenario. Rover poses come from the render loop. */
export function captureScenario(name = "scenario"): Scenario {
  const s = useSimStore.getState();

  const poses: RoverPoseSnapshot[] = [];
  for (let i = 0; i < s.roverCount; i++) {
    const rt = roverRuntimes.get(i);
    poses.push({
      x: rt?.x ?? 0,
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
    fleet: { count: s.roverCount, active: s.activeRover, poses },
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
