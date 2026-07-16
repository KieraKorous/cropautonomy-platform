import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group, PerspectiveCamera } from "three";

import { DroneBody } from "./bodies/DroneBody";
import { RoverBody } from "./bodies/RoverBody";
import { deviceRuntimes, devicePose, dragTarget, type DeviceRuntime } from "./deviceState";
import { blockLanes, deviceDock, rowHalfLength, surveyLanes } from "./field";
import { driveInput } from "./driveInput";
import { onboardCameraRef } from "./onboardCamera";
import { deviceSpec, surveySwath, type DeviceKind, type DeviceSpec } from "../device";
import { peerIndex } from "../devices/fleet";
import { planPath } from "../nav/astar";
import { useSimStore } from "../store/simStore";
import type { NavMode } from "../store/simStore";
import type { Waypoint } from "../types";

// One simulated GAIA device. Everything that differs between device types comes
// from its DeviceSpec — this component owns only the machinery they share: pose,
// nav, the steering core, the reset/restore/home token protocol, telemetry, and
// pick-up-and-drop. The visible body (and its own moving parts) is a per-kind
// subtree, so wheels and rotors are none of the steering code's business.

/** Fleetmates further than this vertically are ignored by avoidance — a drone at
 *  cruise shouldn't swerve for a rover directly beneath it. */
const VERT_CLEARANCE = 4;

type Phase = "traverse" | "step";

interface Nav {
  ready: boolean;
  rowIndex: number;
  stepDir: 1 | -1;
  zDir: 1 | -1;
  phase: Phase;
  tx: number;
  tz: number;
}

/** Aerial devices only: where the airframe is in its takeoff/land cycle. */
type FlightPhase = "grounded" | "takeoff" | "cruise" | "landing";

// Shortest signed angle from a to b, in (-π, π].
function angleTo(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function Device({ index, kind }: { index: number; kind: DeviceKind }) {
  const group = useRef<Group>(null);
  const camRef = useRef<PerspectiveCamera | null>(null);
  const spec: DeviceSpec = deviceSpec(kind);

  const field = useSimStore((s) => s.field);
  const devices = useSimStore((s) => s.devices);
  const activeDevice = useSimStore((s) => s.activeDevice);
  const isActive = activeDevice === index;
  const accent = spec.colors[index % spec.colors.length];

  // Coverage is split among peers of the same class (rovers vs drones), so a lone
  // rover and a lone drone each cover the whole field rather than half each.
  const peer = useMemo(() => peerIndex(devices, index), [devices, index]);

  // A ground device works crop alleys; an aerial one flies strips as wide as its
  // camera footprint at cruise.
  const lanes = useMemo(
    () =>
      spec.flies
        ? surveyLanes(field, peer.ordinal, peer.count, surveySwath(spec))
        : blockLanes(field, peer.ordinal, peer.count),
    [field, peer.ordinal, peer.count, spec]
  );

  // Spawn (and return) at this device's pad on the field's near edge.
  const start = useMemo(
    () => deviceDock(field, peer.ordinal, peer.count, spec.dockSetback),
    [field, peer.ordinal, peer.count, spec.dockSetback]
  );

  const pose = useRef({ x: start.x, y: spec.restY, z: start.z, heading: 0, battery: 1 });
  const nav = useRef<Nav>({
    ready: false,
    rowIndex: 0,
    stepDir: 1,
    zDir: 1,
    phase: "traverse",
    tx: 0,
    tz: 0
  });
  const clock = useRef({ elapsed: 0, sample: 0, frames: 0, frameTime: 0 });
  const lastReset = useRef(0);
  const lastRestore = useRef(0);
  const wasDragging = useRef(false);
  const wp = useRef<{ mode: NavMode; version: number; index: number }>({
    mode: "coverage",
    version: -1,
    index: 0
  });

  // "Return home" state: a planned route back to this device's pad.
  const lastHome = useRef(0);
  const homing = useRef(false);
  const homeIndex = useRef(0);
  const homePath = useRef<Waypoint[]>([]);
  /** Parked at the pad after a Home — stays put until told to work again. */
  const docked = useRef(false);
  const prevRunning = useRef(false);

  const flight = useRef<FlightPhase>("grounded");

  // Register this device's live pose so fleetmates can avoid it and it gets a
  // physics collider. `kind` rides along so hot-path code can size it correctly
  // without touching the store.
  const runtime = useRef<DeviceRuntime>({
    kind,
    x: start.x,
    y: spec.restY,
    z: start.z,
    heading: 0,
    speed: 0
  });
  useLayoutEffect(() => {
    const rt = runtime.current;
    rt.kind = kind;
    deviceRuntimes.set(index, rt);
    return () => {
      deviceRuntimes.delete(index);
    };
  }, [index, kind]);

  // Only the active device's onboard camera drives the PiP feed / captures. Clear
  // the ref on unmount so swapping the active device's kind can't leave the feed
  // pointed at a disposed camera.
  useLayoutEffect(() => {
    if (isActive && camRef.current) onboardCameraRef.current = camRef.current;
    return () => {
      if (onboardCameraRef.current === camRef.current) onboardCameraRef.current = null;
    };
  }, [isActive]);

  function initNav() {
    const half = rowHalfLength(field);
    const p = pose.current;
    let rowIndex = 0;
    let best = Infinity;
    for (let i = 0; i < lanes.length; i++) {
      const d = Math.abs(lanes[i] - p.x);
      if (d < best) {
        best = d;
        rowIndex = i;
      }
    }
    const zDir: 1 | -1 = p.z <= 0 ? 1 : -1;
    nav.current = {
      ready: true,
      rowIndex,
      stepDir: 1,
      zDir,
      phase: "traverse",
      tx: lanes[rowIndex] ?? p.x,
      tz: zDir > 0 ? half : -half
    };
  }

  function nextWaypoint() {
    const half = rowHalfLength(field);
    const n = nav.current;
    if (n.phase === "traverse") {
      let next = n.rowIndex + n.stepDir;
      if (next < 0 || next > lanes.length - 1) {
        n.stepDir = (n.stepDir * -1) as 1 | -1;
        next = n.rowIndex + n.stepDir;
      }
      n.rowIndex = next;
      n.phase = "step";
      n.tx = lanes[n.rowIndex] ?? n.tx;
      n.tz = n.zDir > 0 ? half : -half;
    } else {
      n.zDir = (n.zDir * -1) as 1 | -1;
      n.phase = "traverse";
      n.tx = lanes[n.rowIndex] ?? n.tx;
      n.tz = n.zDir > 0 ? half : -half;
    }
  }

  /** Wipe every derived nav decision so the device re-plans from where it is. */
  function replan() {
    nav.current.ready = false;
    wp.current.version = -1;
    wp.current.index = 0;
    homing.current = false;
    docked.current = false;
  }

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;

    const {
      running,
      resetToken,
      pushTelemetry,
      elapsed: storeElapsed,
      navMode,
      waypoints,
      waypointsVersion,
      obstacles,
      dragging,
      sensorNoise,
      homeToken,
      restoreToken,
      restorePoses
    } = useSimStore.getState();

    const isDragged = dragging && isActive;

    if (resetToken !== lastReset.current) {
      lastReset.current = resetToken;
      pose.current = { x: start.x, y: spec.restY, z: start.z, heading: 0, battery: 1 };
      flight.current = "grounded";
      clock.current.elapsed = 0;
      replan();
    }

    // Scenario load: teleport to the saved pose (or this device's pad if the
    // scenario had fewer devices) and re-plan from there.
    if (restoreToken !== lastRestore.current) {
      lastRestore.current = restoreToken;
      const snap = restorePoses[index];
      pose.current = {
        x: snap?.x ?? start.x,
        y: snap?.y ?? spec.restY,
        z: snap?.z ?? start.z,
        heading: snap?.heading ?? 0,
        battery: snap?.battery ?? 1
      };
      flight.current = pose.current.y > spec.restY + 0.2 ? "cruise" : "grounded";
      clock.current.elapsed = 0;
      replan();
    }

    const delta = Math.min(rawDelta, 0.05);
    const p = pose.current;
    clock.current.frames += 1;
    clock.current.frameTime += rawDelta;

    // Un-park when the operator asks for work again (Run after a pause, a mode
    // switch, or a fresh command).
    if (running && !prevRunning.current) docked.current = false;
    prevRunning.current = running;
    if (wp.current.mode !== navMode && navMode !== "coverage") docked.current = false;

    let speed = 0;
    let steerX: number | null = null;
    let steerZ = 0;
    let arrived = false;
    let onArrive: (() => void) | null = null;
    let targetY = spec.flies ? p.y : spec.restY; // ground devices never leave restY
    let allowLateral = true;

    if (isDragged) {
      p.x = dragTarget.x;
      p.z = dragTarget.z;
      if (spec.flies) p.y = dragTarget.y;
      wasDragging.current = true;
    } else {
      if (wasDragging.current) {
        wasDragging.current = false;
        replan();
      }

      // Return-home: plan once per command. A ground device routes around
      // obstacles with A*; an aerial one just flies straight to its pad (it's
      // above everything the planner would route around).
      if (homeToken !== lastHome.current) {
        lastHome.current = homeToken;
        docked.current = false;
        homePath.current = spec.flies
          ? [{ x: start.x, z: start.z }]
          : planPath(field, obstacles, { x: p.x, z: p.z }, start);
        homeIndex.current = 0;
        homing.current = homePath.current.length > 0;
      }

      // Battery failsafe: bring a dying drone down under control rather than
      // leaving it hanging in the air.
      if (spec.flies && p.battery <= spec.failsafeBattery && p.y > spec.restY + 0.05) {
        homing.current = false;
        flight.current = "landing";
      }

      if (homing.current && p.battery > 0) {
        const path = homePath.current;
        if (homeIndex.current < path.length) {
          const w = path[homeIndex.current];
          steerX = w.x;
          steerZ = w.z;
          arrived = Math.hypot(w.x - p.x, w.z - p.z) < spec.waypointRadius;
          onArrive = () => {
            homeIndex.current += 1;
            if (homeIndex.current >= path.length) {
              homing.current = false;
              // Aerial devices still have to come down before they're parked.
              if (spec.flies) flight.current = "landing";
              else docked.current = true;
            }
          };
        } else {
          homing.current = false;
        }
      } else if (navMode === "manual") {
        // Only the active device takes the controls; the rest hold position.
        wp.current.mode = "manual";
        if (isActive && p.battery > 0) {
          const turn = (driveInput.left ? 1 : 0) - (driveInput.right ? 1 : 0);
          const throttle = (driveInput.forward ? 1 : 0) - (driveInput.back ? 1 : 0);
          p.heading += turn * spec.manual.turn * delta;
          if (throttle !== 0) {
            speed = throttle > 0 ? spec.manual.fwd : -spec.manual.rev;
            p.x += Math.sin(p.heading) * speed * delta;
            p.z += Math.cos(p.heading) * speed * delta;
          }
          if (spec.flies) {
            // Strafe (Q/E) sideways relative to heading, climb/descend (R/F).
            const strafe = (driveInput.strafeR ? 1 : 0) - (driveInput.strafeL ? 1 : 0);
            if (strafe !== 0) {
              p.x += Math.cos(p.heading) * strafe * spec.manual.strafe * delta;
              p.z -= Math.sin(p.heading) * strafe * spec.manual.strafe * delta;
            }
            const lift = (driveInput.up ? 1 : 0) - (driveInput.down ? 1 : 0);
            p.y = clamp(
              p.y + lift * spec.manual.climb * delta,
              spec.restY,
              spec.cruiseY * 2
            );
            targetY = p.y; // hand-flown: hold whatever altitude the pilot set
            flight.current = p.y > spec.restY + 0.2 ? "cruise" : "grounded";
          }
        } else if (spec.flies) {
          targetY = p.y; // fleetmates hover where they are
        }
      } else if (running && p.battery > 0 && !docked.current) {
        if (navMode === "waypoints") {
          wp.current.mode = "waypoints";
          if (wp.current.version !== waypointsVersion) {
            wp.current.version = waypointsVersion;
            wp.current.index = 0;
          }
          if (isActive && wp.current.index < waypoints.length) {
            const w = waypoints[wp.current.index];
            steerX = w.x;
            steerZ = w.z;
            arrived = Math.hypot(w.x - p.x, w.z - p.z) < spec.waypointRadius;
            onArrive = () => {
              wp.current.index += 1;
            };
          }
        } else {
          if (wp.current.mode !== "coverage") {
            wp.current.mode = "coverage";
            nav.current.ready = false;
          }
          if (!nav.current.ready) initNav();
          const n = nav.current;
          if (lanes.length === 0) {
            steerX = null; // no work assigned → idle
          } else if (n.phase === "traverse") {
            // Pure pursuit: aim at a carrot on the pass a short way ahead, so a
            // sideways offset is corrected straight back onto the line.
            steerX = n.tx;
            steerZ = p.z + n.zDir * spec.lookahead;
            arrived =
              n.zDir > 0 ? p.z >= n.tz - spec.waypointRadius : p.z <= n.tz + spec.waypointRadius;
          } else {
            steerX = n.tx;
            steerZ = n.tz;
            arrived = Math.hypot(n.tx - p.x, n.tz - p.z) < spec.waypointRadius;
          }
          onArrive = () => nextWaypoint();
        }
      }

      // --- Airframe: wrap whatever the nav mode asked for with takeoff/landing.
      if (spec.flies && navMode !== "manual") {
        if (flight.current === "landing") {
          const overPad = Math.hypot(start.x - p.x, start.z - p.z) < spec.waypointRadius;
          steerX = start.x;
          steerZ = start.z;
          arrived = false;
          onArrive = null;
          if (overPad) {
            allowLateral = false; // straight down onto the pad
            targetY = spec.restY;
            if (p.y <= spec.restY + 0.05) {
              flight.current = "grounded";
              docked.current = true;
            }
          } else {
            targetY = spec.cruiseY; // fly back at altitude, then descend
          }
        } else if (steerX !== null) {
          if (flight.current === "grounded") flight.current = "takeoff";
          if (flight.current === "takeoff") {
            allowLateral = false; // climb vertically off the pad, no drift
            targetY = spec.cruiseY;
            arrived = false;
            onArrive = null;
            if (p.y >= spec.cruiseY - 0.15) flight.current = "cruise";
          } else {
            targetY = spec.cruiseY;
          }
        } else {
          // Nothing to do → hover in place (a paused drone hangs, as it should).
          targetY = flight.current === "grounded" ? spec.restY : p.y;
        }
      }

      // --- Shared steering: turn toward the target and drive, biasing away from
      // obstacles and fleetmates. heading 0 = +Z, so forward is (sin h, cos h).
      if (steerX !== null && allowLateral && p.battery > 0) {
        clock.current.elapsed += delta;
        const dx = steerX - p.x;
        const dz = steerZ - p.z;
        let desired = Math.atan2(dx, dz);

        let avoidBias = 0;
        const avoid = (ax: number, az: number, radius: number) => {
          const trueClear = Math.hypot(ax - p.x, az - p.z) - radius;
          const clear = sensorNoise ? trueClear + (Math.random() - 0.5) * 0.3 : trueClear;
          if (clear > spec.avoid.range) return;
          const rel = angleTo(p.heading, Math.atan2(ax - p.x, az - p.z));
          if (Math.abs(rel) > spec.avoid.cone) return;
          const strength = (spec.avoid.range - clear) / spec.avoid.range;
          avoidBias += (rel >= 0 ? -1 : 1) * strength * spec.avoid.gain;
        };
        // A drone at cruise simply overflies ground obstacles.
        if (spec.avoidsGround) for (const o of obstacles) avoid(o.x, o.z, o.radius);
        for (const [j, r] of deviceRuntimes) {
          if (j === index) continue;
          if (Math.abs(r.y - p.y) > VERT_CLEARANCE) continue; // different altitude band
          avoid(r.x, r.z, deviceSpec(r.kind).radius);
        }
        desired += avoidBias;

        const err = angleTo(p.heading, desired);
        const maxTurn = spec.turnRate * delta;
        p.heading += Math.max(-maxTurn, Math.min(maxTurn, err));
        const factor = Math.max(spec.minSpeedFactor, Math.cos(err));
        speed = spec.speed * factor;
        p.x += Math.sin(p.heading) * speed * delta;
        p.z += Math.cos(p.heading) * speed * delta;

        if (arrived && onArrive) onArrive();
      }

      // --- Altitude. climbRate/descentRate are 0 for ground devices, so this is
      // provably a no-op for them regardless of what targetY says.
      if (navMode !== "manual") {
        p.y += clamp(targetY - p.y, -spec.descentRate * delta, spec.climbRate * delta);
      }
    }

    // --- Energy, in one place for every mode. Moving costs; for an aerial device
    // merely staying up costs too.
    if (!isDragged && p.battery > 0) {
      const load = Math.abs(speed) > 0.01 ? spec.batteryDrain : 0;
      const hover = spec.flies && p.y > spec.restY + 0.05 ? spec.batteryHover : 0;
      p.battery = Math.max(0, p.battery - (load + hover) * delta);
    }

    // Single authoritative transform write — lifts a ground device while picked up.
    g.position.set(p.x, isDragged ? p.y + spec.dragLift : p.y, p.z);
    g.rotation.y = p.heading;

    // Publish live pose for the collider, fleetmates + planning. The active
    // device also mirrors into devicePose, which the sensors + HUD follow.
    const rt = runtime.current;
    rt.x = p.x;
    rt.y = p.y;
    rt.z = p.z;
    rt.heading = p.heading;
    rt.speed = speed;
    if (isActive) {
      devicePose.kind = kind;
      devicePose.x = p.x;
      devicePose.y = p.y;
      devicePose.z = p.z;
      devicePose.heading = p.heading;
      devicePose.speed = speed;
    }

    // Throttle telemetry to ~6.7Hz so the HUD isn't re-rendering every frame.
    clock.current.sample += rawDelta;
    if (clock.current.sample >= 0.15) {
      const fps = clock.current.frames / clock.current.frameTime;
      pushTelemetry(
        index,
        {
          position: { x: p.x, y: p.y, z: p.z },
          heading: p.heading,
          speed,
          battery: p.battery
        },
        running ? clock.current.elapsed : storeElapsed,
        Number.isFinite(fps) ? Math.round(fps) : 0
      );
      clock.current.sample = 0;
      clock.current.frames = 0;
      clock.current.frameTime = 0;
    }
  });

  // Pick up the device: select it, seed the drag target at its current spot, and
  // flip the store into dragging (the drag-catcher plane takes over from here).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = useSimStore.getState();
    s.setActiveDevice(index);
    dragTarget.x = pose.current.x;
    dragTarget.y = pose.current.y;
    dragTarget.z = pose.current.z;
    s.setDragging(true);
    document.body.style.cursor = "grabbing";
  };
  const onPointerOver = () => {
    if (!useSimStore.getState().dragging) document.body.style.cursor = "grab";
  };
  const onPointerOut = () => {
    if (!useSimStore.getState().dragging) document.body.style.cursor = "";
  };

  return (
    <group
      ref={group}
      position={[start.x, spec.restY, start.z]}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {spec.flies ? (
        <DroneBody index={index} isActive={isActive} accent={accent} />
      ) : (
        <RoverBody index={index} isActive={isActive} accent={accent} />
      )}
      {/* Onboard camera — parented here so it inherits the device's pose. The
          rover looks forward; the drone looks straight down (nadir). Rendered as
          the picture-in-picture feed by <OnboardView />. */}
      <perspectiveCamera
        ref={(c) => {
          camRef.current = c;
          if (isActive && c) onboardCameraRef.current = c;
        }}
        position={spec.camera.offset}
        rotation={spec.camera.rotation}
        fov={spec.camera.fov}
        near={0.1}
        far={800}
      />
    </group>
  );
}

/** The fleet: one Device per slot, of whatever GAIA kind occupies that slot. */
export function Fleet() {
  const devices = useSimStore((s) => s.devices);
  return (
    <>
      {devices.map((kind, i) => (
        // Keyed by kind too: swapping a slot's hardware remounts it, so it
        // re-registers its runtime and spawns on the right pad.
        <Device key={`${i}-${kind}`} index={i} kind={kind} />
      ))}
    </>
  );
}
