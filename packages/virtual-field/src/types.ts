// Shared domain types for the Virtual Field simulator.
//
// Phase 1 keeps this deliberately small — a ground, a camera, lighting, and a
// single placeholder robot. The larger crop/sensor/scenario systems described in
// the PRD land in later phases and will extend these types rather than replace
// them, so keep additions backward-compatible.

/** A weather / lighting preset that drives sky colour, sun angle, and fog. */
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/** Ground-plane / row layout the placeholder field renders. */
export interface FieldConfig {
  /** Full field extent in metres (square). */
  size: number;
  /** Number of crop rows rendered as furrow ridges. */
  rows: number;
  /** Spacing between rows in metres. */
  rowSpacing: number;
}

/** A user-placed navigation target on the ground plane (world X/Z, metres). */
export interface Waypoint {
  x: number;
  z: number;
}

/**
 * Live robot state surfaced to the HUD. Updated on a throttled cadence (not every
 * frame) so the React overlay doesn't re-render at 60fps — the mesh itself is
 * driven imperatively inside the render loop.
 */
export interface RobotTelemetry {
  /** World position, metres. y is fixed to the drive base height in Phase 1. */
  position: { x: number; y: number; z: number };
  /** Heading in radians, 0 = +Z. */
  heading: number;
  /** Ground speed, m/s. */
  speed: number;
  /** Battery charge, 0–1. */
  battery: number;
}
