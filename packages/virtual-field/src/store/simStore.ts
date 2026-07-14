import { create } from "zustand";

import {
  fieldForSpecies,
  generateCrops,
  type Crop,
  type CropSpecies,
  type GrowthStage,
  type Weather
} from "../crop";
import { planPath } from "../nav/astar";
import { generateObstacles, type Obstacle } from "../obstacle";
import { roverPose } from "../scene/roverState";
import type { FieldConfig, RobotTelemetry, TimeOfDay, Waypoint } from "../types";

// Central simulation store. This is the single source of truth for everything the
// UI can toggle and everything the HUD reads back. The render loop (useFrame)
// integrates robot motion imperatively and pushes *throttled* telemetry here — so
// this store re-renders React a few times a second, not 60x. See Robot.tsx.

const FIELD_SIZE = 120;
const DEFAULT_SPECIES: CropSpecies = "corn";
const DEFAULT_STAGE: GrowthStage = "mature";
const DEFAULT_FIELD: FieldConfig = fieldForSpecies(FIELD_SIZE, DEFAULT_SPECIES);

const OBSTACLE_COUNT = 12;
/** The dock the rover starts at and returns to. */
const HOME: Waypoint = { x: 0, z: 0 };

const FULL_BATTERY: RobotTelemetry = {
  position: { x: 0, y: 0, z: 0 },
  heading: 0,
  speed: 0,
  battery: 1
};

export type NavMode = "coverage" | "waypoints" | "manual";

export interface SimState {
  /** Master clock: is the simulation advancing? */
  running: boolean;
  /** Seconds of simulated time elapsed (throttled for display). */
  elapsed: number;
  /** Rendered frames-per-second (throttled sample). */
  fps: number;

  /** Environment. */
  timeOfDay: TimeOfDay;
  weather: Weather;
  showGrid: boolean;
  showRows: boolean;
  showCrops: boolean;

  /** Field / crop generation. `field` geometry follows the species' spacing. */
  field: FieldConfig;
  species: CropSpecies;
  growthStage: GrowthStage;
  /** Reproducible generation seed — bumped by regenerate(). */
  seed: number;
  /** Generated crop records; the renderer and future sensors read from these. */
  crops: Crop[];

  /**
   * How the rover decides where to go:
   *  - "coverage"  — autonomous boustrophedon sweep of the drive-lanes
   *  - "waypoints" — drive the user-dropped waypoints in order, then hold
   */
  navMode: NavMode;
  /** User-placed waypoints (world X/Z), driven in order in "waypoints" mode. */
  waypoints: Waypoint[];
  /** Bumped whenever `waypoints` changes so the render loop can resync its index. */
  waypointsVersion: number;

  /** Physics obstacles — dynamic bodies + inputs to avoidance and A* planning. */
  obstacles: Obstacle[];
  obstacleSeed: number;

  /** True while the user is dragging the rover — suspends nav + freezes the camera. */
  dragging: boolean;

  /** Latest robot telemetry for the HUD. */
  telemetry: RobotTelemetry;

  /**
   * Bumped by reset(). The Robot component watches this to zero out its internal
   * pose refs without the store needing to reach into the render loop.
   */
  resetToken: number;

  // --- actions ---
  play: () => void;
  pause: () => void;
  toggleRun: () => void;
  reset: () => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  setWeather: (w: Weather) => void;
  toggleGrid: () => void;
  toggleRows: () => void;
  toggleCrops: () => void;
  setSpecies: (s: CropSpecies) => void;
  setGrowthStage: (g: GrowthStage) => void;
  regenerate: () => void;
  setNavMode: (m: NavMode) => void;
  addWaypoint: (x: number, z: number) => void;
  clearWaypoints: () => void;
  regenerateObstacles: () => void;
  clearObstacles: () => void;
  setDragging: (d: boolean) => void;
  /** Plan an A* route from the rover's current pose back to the dock and drive it. */
  returnHome: () => void;
  /** Called from the render loop with a fresh telemetry sample. */
  pushTelemetry: (t: RobotTelemetry, elapsed: number, fps: number) => void;
}

export const useSimStore = create<SimState>((set) => ({
  running: false,
  elapsed: 0,
  fps: 0,

  timeOfDay: "day",
  weather: "clear",
  showGrid: true,
  showRows: true,
  showCrops: true,

  field: DEFAULT_FIELD,
  species: DEFAULT_SPECIES,
  growthStage: DEFAULT_STAGE,
  seed: 1,
  crops: generateCrops(DEFAULT_FIELD, DEFAULT_SPECIES, DEFAULT_STAGE, 1),

  navMode: "coverage",
  waypoints: [],
  waypointsVersion: 0,

  obstacles: generateObstacles(DEFAULT_FIELD, OBSTACLE_COUNT, 1),
  obstacleSeed: 1,

  dragging: false,

  telemetry: FULL_BATTERY,
  resetToken: 0,

  play: () => set({ running: true }),
  pause: () => set({ running: false }),
  toggleRun: () => set((s) => ({ running: !s.running })),
  reset: () =>
    set((s) => ({
      running: false,
      elapsed: 0,
      telemetry: FULL_BATTERY,
      resetToken: s.resetToken + 1
    })),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setWeather: (weather) => set({ weather }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleRows: () => set((s) => ({ showRows: !s.showRows })),
  toggleCrops: () => set((s) => ({ showCrops: !s.showCrops })),
  setSpecies: (species) =>
    set((s) => {
      // A new species re-geometries the field (its own row spacing) and replants.
      const field = fieldForSpecies(s.field.size, species);
      return { species, field, crops: generateCrops(field, species, s.growthStage, s.seed) };
    }),
  setGrowthStage: (growthStage) =>
    set((s) => ({
      growthStage,
      crops: generateCrops(s.field, s.species, growthStage, s.seed)
    })),
  regenerate: () =>
    set((s) => {
      const seed = s.seed + 1;
      return { seed, crops: generateCrops(s.field, s.species, s.growthStage, seed) };
    }),
  setNavMode: (navMode) => set({ navMode }),
  addWaypoint: (x, z) =>
    set((s) => ({
      waypoints: [...s.waypoints, { x, z }],
      waypointsVersion: s.waypointsVersion + 1
    })),
  clearWaypoints: () =>
    set((s) => ({ waypoints: [], waypointsVersion: s.waypointsVersion + 1 })),
  regenerateObstacles: () =>
    set((s) => {
      const obstacleSeed = s.obstacleSeed + 1;
      return { obstacleSeed, obstacles: generateObstacles(s.field, OBSTACLE_COUNT, obstacleSeed) };
    }),
  clearObstacles: () => set({ obstacles: [] }),
  setDragging: (dragging) => set({ dragging }),
  returnHome: () =>
    set((s) => {
      // A* from the rover's live pose back to the dock, driven as waypoints.
      const path = planPath(s.field, s.obstacles, { x: roverPose.x, z: roverPose.z }, HOME);
      return {
        waypoints: path.length > 0 ? path : [HOME],
        waypointsVersion: s.waypointsVersion + 1,
        navMode: "waypoints",
        running: true
      };
    }),
  pushTelemetry: (telemetry, elapsed, fps) => set({ telemetry, elapsed, fps })
}));
