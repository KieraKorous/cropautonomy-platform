// GAIA device types in the simulator.
//
// The `kind` keys are the platform's authoritative `device_family` literals (see
// packages/db/migrations/0012_*.sql and apps/portal-web/lib/api.ts) — NOT sim-local
// names — so a simulated device maps 1:1 to a real registered device. Labels match
// apps/portal-web/app/(dashboard)/devices/deviceDisplay.tsx.
//
// Everything that varies between devices lives in DEVICE_SPECS. The rover's values
// are transcribed verbatim from the original Robot.tsx constants, so generalising
// the code path leaves ground-rover behaviour bit-identical.

export type DeviceKind = "gaia_r" | "gaia_d";
// `gaia_s` (Sensor station) is the next device — deliberately not modelled yet.

/** Max devices in a fleet. The single source of truth (was duplicated 3×). */
export const MAX_DEVICES = 4;

export interface DeviceSpec {
  kind: DeviceKind;
  /** Platform display label, e.g. "Ground rover". */
  label: string;
  /** Short product name, e.g. "GAIA-R". */
  short: string;
  /** True if the device operates above the ground (altitude is a state variable). */
  flies: boolean;

  /** Body height when parked/landed — the rover's old CHASSIS_Y. */
  restY: number;
  /** Working altitude while surveying (ground devices: === restY). */
  cruiseY: number;
  /**
   * Vertical speed, m/s. **Zero for ground devices** — which is what guarantees a
   * rover's altitude can never move, no matter what a nav command asks for. That's
   * an arithmetic invariant, not a convention.
   */
  climbRate: number;
  descentRate: number;

  /** Cruise speed along a pass, m/s. */
  speed: number;
  /** Max steering rate, rad/s. */
  turnRate: number;
  /** Crawl factor through sharp turns (never fully stall). */
  minSpeedFactor: number;
  /** Charge drained per second while moving. */
  batteryDrain: number;
  /** Extra charge per second merely to stay airborne (0 for ground devices). */
  batteryHover: number;
  /**
   * Return-to-depot reserve: at or below this charge the device abandons its task
   * and heads home to recharge. Sized to get it back from the far corner of its
   * section with margin — the point is to arrive, not to die trying.
   */
  reserveBattery: number;
  /** Charge per second gained while docked in the depot (mains). */
  chargeRate: number;
  /**
   * Charge per second from the onboard solar panels in *full* sun. Scaled by the
   * live sun intensity, so time of day and weather change how long a device can
   * stay out. It offsets draw rather than replacing it — a drone can't fly on
   * solar, but a rover can stretch a shift considerably on a clear day.
   */
  solarRate: number;
  /** Treated as this-radius by fleetmates' avoidance. */
  radius: number;
  /** "Arrived" threshold, m. */
  waypointRadius: number;
  /** Pure-pursuit carrot distance for rejoining a pass, m. */
  lookahead: number;

  /** Half-extents of the kinematic collider. */
  collider: { hx: number; hy: number; hz: number };

  /** Onboard camera, parented to the body. */
  camera: {
    offset: [number, number, number];
    /** R3F cameras look down local -Z: yaw π = forward; pitch -π/2 = nadir. */
    rotation: [number, number, number];
    fov: number;
  };

  /** Reactive avoidance tuning. */
  avoid: { range: number; cone: number; gain: number };
  /** False → flies over ground obstacles instead of steering around them. */
  avoidsGround: boolean;

  /** Manual control rates. `strafe`/`climb` are 0 for ground devices. */
  manual: { fwd: number; rev: number; turn: number; strafe: number; climb: number };
  /** HUD hint for manual mode — kills the hardcoded "W A S D" string. */
  manualHint: string;

  /** Does this device carry a scanning LiDAR? (A 2D sweep from 12m is nonsense.) */
  lidar: boolean;

  /**
   * Detection projection thresholds for Vision.tsx. A nadir camera at altitude
   * frames far more, far smaller plants than a 1m forward camera — with the
   * rover's values a drone's detections/AI/capture come back empty.
   */
  detect: { maxDistance: number; minArea: number; maxCount: number };

  /** How far the body lifts while picked up. */
  dragLift: number;
  /** Per-index accent palette. */
  colors: string[];
}

export const DEVICE_SPECS: Record<DeviceKind, DeviceSpec> = {
  // Values below are the original Robot.tsx constants — do not retune here.
  gaia_r: {
    kind: "gaia_r",
    label: "Ground rover",
    short: "GAIA-R",
    flies: false,
    restY: 0.55,
    cruiseY: 0.55,
    climbRate: 0, // ← pins the rover to the ground, arithmetically
    descentRate: 0,
    speed: 3.6,
    turnRate: 2.1,
    minSpeedFactor: 0.18,
    batteryDrain: 0.004,
    batteryHover: 0,
    // ~19% gets it home from the far corner (≈170m of alley + headland); 22% for margin.
    reserveBattery: 0.22,
    chargeRate: 0.06, // ~17s from flat on the depot's charge post
    solarRate: 0.0015, // deck panels — stretches a clear-day shift by ~60%
    radius: 1.1,
    waypointRadius: 1.1,
    lookahead: 4,
    collider: { hx: 0.75, hy: 0.4, hz: 1.05 },
    camera: { offset: [0, 1.0, 0.62], rotation: [0, Math.PI, 0], fov: 62 },
    avoid: { range: 4.2, cone: 1.15, gain: 1.5 },
    avoidsGround: true,
    manual: { fwd: 4.6, rev: 2.6, turn: 1.9, strafe: 0, climb: 0 },
    manualHint: "W A S D / arrows to drive.",
    lidar: true,
    detect: { maxDistance: 22, minArea: 0.0006, maxCount: 80 },
    dragLift: 1.4,
    colors: ["#3f6f5f", "#c1734a", "#4a6fa5", "#9c6b3f"]
  },
  gaia_d: {
    kind: "gaia_d",
    label: "Aerial drone",
    short: "GAIA-D",
    flies: true,
    restY: 0.35, // sits low on its pad
    cruiseY: 12,
    climbRate: 3.2,
    descentRate: 2.4, // descend gentler than climb
    speed: 8.5, // covers ground much faster than a rover
    turnRate: 1.6, // wide, smooth turns at speed
    minSpeedFactor: 0.35,
    batteryDrain: 0.009,
    batteryHover: 0.004, // staying up costs even when stationary
    reserveBattery: 0.2, // it burns ~0.013/s in flight — leave real margin to get back
    chargeRate: 0.08, // charges faster on the roof pad than a rover does
    solarRate: 0.0006, // token panel area against a heavy draw — you can't fly on solar
    radius: 1.4,
    waypointRadius: 2.2, // looser — it's moving fast and high
    lookahead: 9,
    collider: { hx: 0.6, hy: 0.25, hz: 0.6 },
    // Nadir: pitch -90° maps the camera's -Z view axis to straight down.
    camera: { offset: [0, -0.25, 0], rotation: [-Math.PI / 2, 0, Math.PI], fov: 70 },
    avoid: { range: 5, cone: 1.0, gain: 1.2 },
    avoidsGround: false, // flies over barrels instead of steering around them
    manual: { fwd: 9, rev: 5, turn: 1.8, strafe: 5, climb: 3 },
    manualHint: "W A S D fly · Q E strafe · R F climb/descend.",
    lidar: false, // a 2D ground sweep from 12m would be physically meaningless
    // Off-nadir crops at 12m reach ~20m slant range and frame far smaller.
    detect: { maxDistance: 30, minArea: 0.00008, maxCount: 220 },
    dragLift: 0, // it already flies; no lift affordance needed
    colors: ["#4a6fa5", "#7a5aa8", "#3f8fa5", "#5a6fb8"] // cool tones vs the rover's earth
  }
};

/**
 * Cross-track ground footprint of a nadir camera at cruise, minus overlap — how
 * wide one survey strip is. Derived from the camera + altitude rather than
 * hand-tuned, so changing the cruise altitude changes the flight plan to match.
 * Uses vertical FOV (conservative: the real horizontal footprint is wider), so we
 * err toward overlap rather than gaps.
 */
const SURVEY_OVERLAP = 0.3;
export function surveySwath(spec: DeviceSpec): number {
  return (
    2 * spec.cruiseY * Math.tan((spec.camera.fov * Math.PI) / 360) * (1 - SURVEY_OVERLAP)
  );
}

export function deviceSpec(kind: DeviceKind): DeviceSpec {
  return DEVICE_SPECS[kind] ?? DEVICE_SPECS.gaia_r;
}

/** "GAIA-D 02" — the HUD/telemetry name for a fleet slot. */
export function deviceName(kind: DeviceKind, index: number): string {
  return `${deviceSpec(kind).short} ${String(index + 1).padStart(2, "0")}`;
}
