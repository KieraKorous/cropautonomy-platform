import { create } from "zustand";

import {
  fieldForSpecies,
  generateCrops,
  type Crop,
  type CropSpecies,
  type GrowthStage,
  type Weather
} from "../crop";
import { blankStats, type AiStats } from "../ai/analytics";
import type { Prediction } from "../ai/inference";
import { deviceSpec, MAX_DEVICES, type DeviceKind } from "../device";
import { generateObstacles, type Obstacle } from "../obstacle";
// Type-only (erased at build), so this doesn't create a runtime import cycle
// with scenario.ts, which imports the store to snapshot it.
import type { DevicePoseSnapshot, Scenario } from "../scenario";
import type { StationReadout } from "../sensors/microclimate";
import type { Detection } from "../vision/detections";
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

function clampNum(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const FULL_BATTERY: RobotTelemetry = {
  position: { x: 0, y: 0, z: 0 },
  heading: 0,
  speed: 0,
  battery: 1
};

export type NavMode = "coverage" | "waypoints" | "manual";
export type CameraMode = "rgb" | "depth";

/** Latest simulated sensor readings surfaced to the HUD (throttled). */
export interface SensorReadout {
  gps: { lat: number; lon: number; accuracyM: number };
  yawRateDeg: number;
  odometerM: number;
  /** Downward rangefinder — height above ground. Constant for ground devices. */
  altitudeAgl: number;
  /** Null on devices that carry no LiDAR (e.g. the drone). */
  lidarNearest: number | null;
  lidarPoints: number;
  ultrasonic: number | null;
}

const EMPTY_SENSORS: SensorReadout = {
  gps: { lat: 0, lon: 0, accuracyM: 0 },
  yawRateDeg: 0,
  odometerM: 0,
  altitudeAgl: 0,
  lidarNearest: null,
  lidarPoints: 0,
  ultrasonic: null
};

const EMPTY_STATION: StationReadout = {
  soilMoisture: 0,
  soilTempC: 0,
  airTempC: 0,
  humidity: 0,
  leafWetness: 0,
  par: 0
};

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

  /**
   * The onboard camera feed's placement, in CSS px from the bottom-right corner.
   * User-movable and resizable, so it's state rather than a constant — the WebGL
   * inset and the HUD frame both read it, which is what keeps them aligned.
   */
  pip: { w: number; h: number; right: number; bottom: number };

  /** Sensor simulation. */
  showLidar: boolean;
  sensorNoise: boolean; // gaussian noise + dropout on
  rtk: boolean; // GPS in RTK-fix precision vs standalone
  cameraMode: CameraMode; // onboard feed: RGB or depth
  sensors: SensorReadout;
  /** Latest soil/microclimate readout of the active device *when it's a station*. */
  stationReadout: StationReadout;

  /** Computer vision: live detection boxes + dataset capture. */
  showDetections: boolean;
  detections: Detection[];
  captureRequested: boolean;
  captureCount: number;

  /** AI perception layer: runs the model on the scan + accumulates analytics. */
  aiRunning: boolean;
  aiPredictions: Prediction[];
  aiStats: AiStats;
  /** Bumped by resetAi() so the scene layer can clear the analytics accumulator. */
  aiResetToken: number;

  /** Fleet: number of rovers, which one is active (camera/sensors/HUD focus). */
  /** One entry per fleet slot — the GAIA device type occupying it. */
  devices: DeviceKind[];
  /** Index of the device the camera, sensors, HUD + manual control follow. */
  activeDevice: number;
  /** Per-rover telemetry (index-aligned); `telemetry` mirrors the active one. */
  fleet: RobotTelemetry[];

  /** Latest telemetry of the active rover, for the HUD. */
  telemetry: RobotTelemetry;

  /**
   * Bumped by reset(). The Robot component watches this to zero out its internal
   * pose refs without the store needing to reach into the render loop.
   */
  resetToken: number;
  /** Bumped by returnHome(); each rover replans a route to its own dock. */
  homeToken: number;
  /** Bumped by loadScenario(); each rover teleports to its saved pose. */
  restoreToken: number;
  restorePoses: DevicePoseSnapshot[];

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
  /** Move/resize the camera feed (clamped to something usable + on-screen). */
  setPip: (patch: Partial<SimState["pip"]>) => void;
  toggleLidar: () => void;
  toggleSensorNoise: () => void;
  toggleRtk: () => void;
  setCameraMode: (m: CameraMode) => void;
  /** Called from the sensor loop with a fresh (throttled) readout. */
  pushSensors: (r: SensorReadout) => void;
  /** Called from the active station's render loop with a fresh soil/microclimate readout. */
  pushStation: (r: StationReadout) => void;
  toggleDetections: () => void;
  pushDetections: (d: Detection[]) => void;
  /** Request a dataset frame capture; the Vision component performs it next frame. */
  requestCapture: () => void;
  /** Called by the Vision component once a capture has been written out. */
  markCaptured: () => void;
  toggleAi: () => void;
  /** Called from the scan loop with the current predictions + accumulated stats. */
  pushAi: (predictions: Prediction[], stats: AiStats) => void;
  resetAi: () => void;
  /** Plan an A* route from the rover's current pose back to the dock and drive it. */
  returnHome: () => void;
  /** Replace the entire world with a saved scenario (digital-twin restore). */
  loadScenario: (scenario: Scenario) => void;
  setDeviceCount: (n: number) => void;
  /** Swap the GAIA device type in a fleet slot (e.g. rover → drone). */
  setDeviceKind: (index: number, kind: DeviceKind) => void;
  /** Add a device of `kind` to the fleet and select it. */
  addDevice: (kind: DeviceKind) => void;
  removeDevice: (index: number) => void;
  setActiveDevice: (i: number) => void;
  /** Called from each rover's render loop with a fresh telemetry sample. */
  pushTelemetry: (index: number, t: RobotTelemetry, elapsed: number, fps: number) => void;
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

  pip: { w: 340, h: 210, right: 16, bottom: 16 },

  showLidar: true,
  sensorNoise: true,
  rtk: true,
  cameraMode: "rgb",
  sensors: EMPTY_SENSORS,
  stationReadout: EMPTY_STATION,

  showDetections: false,
  detections: [],
  captureRequested: false,
  captureCount: 0,

  aiRunning: false,
  aiPredictions: [],
  aiStats: blankStats(),
  aiResetToken: 0,

  devices: ["gaia_r"],
  activeDevice: 0,
  fleet: [FULL_BATTERY],
  telemetry: FULL_BATTERY,
  resetToken: 0,
  homeToken: 0,
  restoreToken: 0,
  restorePoses: [],

  play: () => set({ running: true }),
  pause: () => set({ running: false }),
  toggleRun: () => set((s) => ({ running: !s.running })),
  reset: () =>
    set((s) => ({
      running: false,
      elapsed: 0,
      telemetry: FULL_BATTERY,
      fleet: s.fleet.map(() => FULL_BATTERY),
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
  setPip: (patch) =>
    set((s) => {
      const p = { ...s.pip, ...patch };
      return {
        pip: {
          w: clampNum(p.w, 200, 900),
          h: clampNum(p.h, 130, 640),
          right: Math.max(8, p.right),
          bottom: Math.max(8, p.bottom)
        }
      };
    }),
  toggleLidar: () => set((s) => ({ showLidar: !s.showLidar })),
  toggleSensorNoise: () => set((s) => ({ sensorNoise: !s.sensorNoise })),
  toggleRtk: () => set((s) => ({ rtk: !s.rtk })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  pushSensors: (sensors) => set({ sensors }),
  pushStation: (stationReadout) => set({ stationReadout }),
  toggleDetections: () => set((s) => ({ showDetections: !s.showDetections })),
  pushDetections: (detections) => set({ detections }),
  requestCapture: () => set({ captureRequested: true }),
  markCaptured: () =>
    set((s) => ({ captureRequested: false, captureCount: s.captureCount + 1 })),
  toggleAi: () => set((s) => ({ aiRunning: !s.aiRunning })),
  pushAi: (aiPredictions, aiStats) => set({ aiPredictions, aiStats }),
  resetAi: () =>
    set((s) => ({
      aiPredictions: [],
      aiStats: blankStats(),
      aiResetToken: s.aiResetToken + 1
    })),
  returnHome: () =>
    // Each rover independently A*-plans a route to its own dock (see Rover).
    set((s) => ({ homeToken: s.homeToken + 1, running: true })),
  loadScenario: (sc) =>
    set((s) => {
      // Crops are rebuilt from the seed triple — identical field, no plant records.
      const { species, growthStage, seed } = sc.field;
      const field = fieldForSpecies(s.field.size, species);
      const crops = generateCrops(field, species, growthStage, seed);

      const count = Math.max(1, Math.min(MAX_DEVICES, Math.round(sc.fleet.count ?? 1)));
      const active = Math.max(0, Math.min(count - 1, sc.fleet.active ?? 0));
      const poses = sc.fleet.poses ?? [];
      // v1 scenarios predate device kinds + altitude: default to a ground rover
      // parked at its rest height.
      const devices = Array.from(
        { length: count },
        (_, i): DeviceKind => poses[i]?.kind ?? "gaia_r"
      );
      const fleet = Array.from({ length: count }, (_, i) => {
        const p = poses[i];
        if (!p) return FULL_BATTERY;
        const spec = deviceSpec(devices[i]);
        return {
          position: { x: p.x, y: p.y ?? spec.restY, z: p.z },
          heading: p.heading,
          speed: 0,
          battery: p.battery
        };
      });

      // Tolerate scenarios written by older/partial exports.
      const tasks = sc.tasks ?? { navMode: s.navMode, waypoints: [], running: false };
      const sensors = sc.sensors ?? {
        showLidar: s.showLidar,
        sensorNoise: s.sensorNoise,
        rtk: s.rtk,
        cameraMode: s.cameraMode
      };
      const vision = sc.vision ?? { showDetections: s.showDetections, aiRunning: s.aiRunning };

      return {
        timeOfDay: sc.environment.timeOfDay,
        weather: sc.environment.weather,
        showGrid: sc.environment.showGrid,
        showRows: sc.environment.showRows,
        showCrops: sc.environment.showCrops,

        species,
        growthStage,
        seed,
        field,
        crops,
        obstacles: sc.obstacles ?? [],

        devices,
        activeDevice: active,
        fleet,
        telemetry: fleet[active] ?? FULL_BATTERY,

        navMode: tasks.navMode,
        waypoints: tasks.waypoints ?? [],
        waypointsVersion: s.waypointsVersion + 1,
        running: tasks.running,

        showLidar: sensors.showLidar,
        sensorNoise: sensors.sensorNoise,
        rtk: sensors.rtk,
        cameraMode: sensors.cameraMode,
        showDetections: vision.showDetections,
        aiRunning: vision.aiRunning,

        // A new world invalidates the accumulated scan + current-frame results.
        aiResetToken: s.aiResetToken + 1,
        aiStats: blankStats(),
        aiPredictions: [],
        detections: [],
        elapsed: 0,

        // Teleport each rover to its saved pose.
        restoreToken: s.restoreToken + 1,
        restorePoses: poses
      };
    }),
  setDeviceCount: (n) =>
    set((s) => {
      const count = Math.max(1, Math.min(MAX_DEVICES, Math.round(n)));
      // New slots default to a ground rover; existing slots keep their kind.
      const devices = Array.from({ length: count }, (_, i) => s.devices[i] ?? "gaia_r");
      const fleet = Array.from({ length: count }, (_, i) => s.fleet[i] ?? FULL_BATTERY);
      // Resizing the fleet re-docks everyone (re-spreads start positions).
      return {
        devices,
        fleet,
        activeDevice: Math.min(s.activeDevice, count - 1),
        resetToken: s.resetToken + 1
      };
    }),
  setDeviceKind: (index, kind) =>
    set((s) => {
      if (!s.devices[index] || s.devices[index] === kind) return {};
      const devices = s.devices.slice();
      devices[index] = kind;
      const fleet = s.fleet.slice();
      fleet[index] = FULL_BATTERY;
      // Swapping the hardware in a slot re-docks the fleet so the new device
      // spawns on the right pad with a fresh nav plan.
      return { devices, fleet, resetToken: s.resetToken + 1 };
    }),
  addDevice: (kind) =>
    set((s) => {
      if (s.devices.length >= MAX_DEVICES) return {};
      const devices = [...s.devices, kind];
      const fleet = [...s.fleet, FULL_BATTERY];
      // Adding hardware re-docks the fleet: peer-class partitioning means the
      // existing devices' assigned blocks (and pads) just changed.
      return {
        devices,
        fleet,
        activeDevice: devices.length - 1,
        resetToken: s.resetToken + 1
      };
    }),
  removeDevice: (index) =>
    set((s) => {
      if (s.devices.length <= 1) return {};
      const devices = s.devices.filter((_, i) => i !== index);
      const fleet = s.fleet.filter((_, i) => i !== index);
      return {
        devices,
        fleet,
        activeDevice: Math.min(s.activeDevice, devices.length - 1),
        resetToken: s.resetToken + 1
      };
    }),
  setActiveDevice: (i) =>
    set((s) => ({ activeDevice: Math.max(0, Math.min(s.devices.length - 1, i)) })),
  pushTelemetry: (index, telemetry, elapsed, fps) =>
    set((s) => {
      const fleet = s.fleet.slice();
      fleet[index] = telemetry;
      // The active rover drives the headline telemetry + clock/fps.
      if (index === s.activeDevice) return { fleet, telemetry, elapsed, fps };
      return { fleet };
    })
}));
