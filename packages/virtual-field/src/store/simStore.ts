import { create } from "zustand";

import type { FieldConfig, RobotTelemetry, TimeOfDay, Waypoint } from "../types";

// Central simulation store. This is the single source of truth for everything the
// UI can toggle and everything the HUD reads back. The render loop (useFrame)
// integrates robot motion imperatively and pushes *throttled* telemetry here — so
// this store re-renders React a few times a second, not 60x. See Robot.tsx.

const DEFAULT_FIELD: FieldConfig = {
  size: 120,
  rows: 28,
  rowSpacing: 3
};

const FULL_BATTERY: RobotTelemetry = {
  position: { x: 0, y: 0, z: 0 },
  heading: 0,
  speed: 0,
  battery: 1
};

export type NavMode = "coverage" | "waypoints";

export interface SimState {
  /** Master clock: is the simulation advancing? */
  running: boolean;
  /** Seconds of simulated time elapsed (throttled for display). */
  elapsed: number;
  /** Rendered frames-per-second (throttled sample). */
  fps: number;

  /** Environment. */
  timeOfDay: TimeOfDay;
  showGrid: boolean;
  showRows: boolean;
  showCrops: boolean;
  field: FieldConfig;

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
  toggleGrid: () => void;
  toggleRows: () => void;
  toggleCrops: () => void;
  setNavMode: (m: NavMode) => void;
  addWaypoint: (x: number, z: number) => void;
  clearWaypoints: () => void;
  /** Called from the render loop with a fresh telemetry sample. */
  pushTelemetry: (t: RobotTelemetry, elapsed: number, fps: number) => void;
}

export const useSimStore = create<SimState>((set) => ({
  running: false,
  elapsed: 0,
  fps: 0,

  timeOfDay: "day",
  showGrid: true,
  showRows: true,
  showCrops: true,
  field: DEFAULT_FIELD,

  navMode: "coverage",
  waypoints: [],
  waypointsVersion: 0,

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
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleRows: () => set((s) => ({ showRows: !s.showRows })),
  toggleCrops: () => set((s) => ({ showCrops: !s.showCrops })),
  setNavMode: (navMode) => set({ navMode }),
  addWaypoint: (x, z) =>
    set((s) => ({
      waypoints: [...s.waypoints, { x, z }],
      waypointsVersion: s.waypointsVersion + 1
    })),
  clearWaypoints: () =>
    set((s) => ({ waypoints: [], waypointsVersion: s.waypointsVersion + 1 })),
  pushTelemetry: (telemetry, elapsed, fps) => set({ telemetry, elapsed, fps })
}));
