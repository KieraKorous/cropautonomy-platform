// @gaia/virtual-field — browser-based agricultural digital-twin simulator.
//
// Phase 1 surface: a rendered field (ground + lighting + camera) with a single
// placeholder robot and a live HUD. Built as a package (not an app route) so it
// can be relocated later — today it mounts inside the portal, tomorrow it could
// move to a public marketing surface or a dedicated app without a rewrite.
//
// Consumer contract: mount <VirtualField /> inside a sized, positioned box.
// It's client-only (WebGL) — load it with `dynamic(..., { ssr: false })` in Next.

export { VirtualField } from "./VirtualField";
export type { VirtualFieldProps } from "./VirtualField";
export { useSimStore } from "./store/simStore";
export type { SimState, NavMode } from "./store/simStore";
export type { TimeOfDay, FieldConfig, RobotTelemetry, Waypoint } from "./types";
export {
  SPECIES,
  GROWTH_STAGES,
  generateCrops,
  fieldForSpecies,
  type Crop,
  type CropSpecies,
  type GrowthStage,
  type Weather,
  type SpeciesDef
} from "./crop";
// GAIA device types. `DeviceKind` uses the platform's authoritative device_family
// literals (gaia_r / gaia_d), so a simulated device maps 1:1 to a registered one.
export {
  DEVICE_SPECS,
  MAX_DEVICES,
  deviceSpec,
  deviceName,
  surveySwath,
  type DeviceKind,
  type DeviceSpec
} from "./device";
export { generateObstacles, type Obstacle, type ObstacleKind } from "./obstacle";
export { planPath } from "./nav/astar";
// Scenario Manager — snapshot/restore the whole world (digital-twin support).
export {
  captureScenario,
  downloadScenario,
  parseScenario,
  SCENARIO_VERSION,
  type Scenario,
  type DevicePoseSnapshot
} from "./scenario";
