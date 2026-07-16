import { deviceSpec, type DeviceKind } from "../device";

// Live pose of every device, outside React (the 60fps hot path must not re-render).
//
// `y` is a real state variable here: ground devices pin it to their spec's restY,
// while the drone integrates it (takeoff / cruise / land). Anything that follows a
// device — sensors, physics collider, drag, planning — reads these.

export interface DeviceRuntime {
  kind: DeviceKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
}

// Seed values only — overwritten on the active device's first frame.
const SEED_KIND: DeviceKind = "gaia_r";
const SEED_Y = deviceSpec(SEED_KIND).restY;

/** Live pose of the *active* device — what the sensors, camera + HUD follow. */
export const devicePose: DeviceRuntime = {
  kind: SEED_KIND,
  x: 0,
  y: SEED_Y,
  z: 0,
  heading: 0,
  speed: 0
};

/**
 * Live pose of every device in the fleet, keyed by slot index. Each Device
 * registers its runtime here so fleetmates can avoid it and each gets its own
 * physics collider. The active device also mirrors into `devicePose`.
 */
export const deviceRuntimes = new Map<number, DeviceRuntime>();

/**
 * Where the active device is being dragged to, written by the drag-catcher plane.
 * `y` lets a flying device be placed at altitude rather than snapped to the soil.
 */
export const dragTarget = { x: 0, y: SEED_Y, z: 0 };
