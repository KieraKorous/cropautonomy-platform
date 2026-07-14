import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

import type { ThreeEvent } from "@react-three/fiber";

import { driveInput } from "./driveInput";
import { driveLanes, rowHalfLength } from "./field";
import { onboardCameraRef } from "./onboardCamera";
import { dragTarget, roverPose } from "./roverState";
import { useSimStore } from "../store/simStore";
import type { NavMode } from "../store/simStore";
import type { FieldConfig } from "../types";

const DRIVE_SPEED = 3.6; // m/s along a row
const TURN_RATE = 2.1; // rad/s max steering rate
const WAYPOINT_RADIUS = 1.1; // m — "arrived" threshold
const LOOKAHEAD = 4; // m — pure-pursuit carrot distance for rejoining a row
const MIN_SPEED_FACTOR = 0.18; // crawl (not stall) through sharp headland turns
const BATTERY_DRAIN = 0.004; // charge per second while driving
const CHASSIS_Y = 0.55; // drive-base height above soil

// Reactive obstacle avoidance: obstacles within AVOID_RANGE and inside a forward
// cone push the desired heading to the opposite side. Layers on top of whatever
// target (coverage lane or waypoint) the rover is pursuing.
const AVOID_RANGE = 4.2; // m of clearance at which avoidance kicks in
const AVOID_CONE = 1.15; // rad half-angle of the "ahead" cone (~66°)
const AVOID_GAIN = 1.5; // how hard to steer away

// Manual (keyboard) driving.
const MANUAL_SPEED = 4.6; // m/s forward
const MANUAL_REVERSE = 2.6; // m/s in reverse
const MANUAL_TURN = 1.9; // rad/s

const DRAG_LIFT = 1.4; // how far the rover lifts off the ground while picked up

// Row-follower navigation. The rover drives the alleys between crop rows (the
// drive-lanes from field.ts), which run along Z. It steers onto the *nearest*
// lane from wherever it starts, drives its full length, then turns into the
// adjacent lane and runs it the opposite way — a boustrophedon coverage sweep
// that bounces at the outer lanes. Two phases:
//   traverse — drive the length of the current row (Δz)
//   step     — shuffle across the headland to the next row's centre-line (Δx)
// Reaching a traverse waypoint is exactly "this row ended" → turn down the next.
type Phase = "traverse" | "step";

interface Nav {
  ready: boolean;
  rowIndex: number; // which row (index into offsets) we're on/heading to
  stepDir: 1 | -1; // direction we walk through rows; bounces at the ends
  zDir: 1 | -1; // which end of the row we're driving toward
  phase: Phase;
  tx: number; // current waypoint
  tz: number;
}

// Shortest signed angle from a to b, in (-π, π].
function angleTo(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function Robot({ field }: { field: FieldConfig }) {
  const group = useRef<Group>(null);
  const wheels = useRef<Mesh[]>([]);

  const pose = useRef({ x: 0, z: 0, heading: 0, battery: 1 });
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
  const wasDragging = useRef(false);

  // Waypoint-mode cursor. `mode`/`version` detect when to resync: switching modes
  // or editing the waypoint list restarts the run from the first target.
  const wp = useRef<{ mode: NavMode; version: number; index: number }>({
    mode: "coverage",
    version: -1,
    index: 0
  });

  // Pick the row nearest the current X and aim at its far end — this is what
  // makes coverage start correctly "no matter where it starts".
  function initNav() {
    const offsets = driveLanes(field);
    const half = rowHalfLength(field);
    const p = pose.current;

    let rowIndex = 0;
    let best = Infinity;
    for (let i = 0; i < offsets.length; i++) {
      const d = Math.abs(offsets[i] - p.x);
      if (d < best) {
        best = d;
        rowIndex = i;
      }
    }
    const zDir: 1 | -1 = p.z <= 0 ? 1 : -1; // drive toward the farther end

    nav.current = {
      ready: true,
      rowIndex,
      stepDir: 1,
      zDir,
      phase: "traverse",
      tx: offsets[rowIndex],
      tz: zDir > 0 ? half : -half
    };
  }

  // Advance the state machine when a waypoint is reached.
  function nextWaypoint() {
    const offsets = driveLanes(field);
    const half = rowHalfLength(field);
    const n = nav.current;

    if (n.phase === "traverse") {
      // Row finished: step across the headland to the next row (bounce at ends).
      let next = n.rowIndex + n.stepDir;
      if (next < 0 || next > offsets.length - 1) {
        n.stepDir = (n.stepDir * -1) as 1 | -1;
        next = n.rowIndex + n.stepDir;
      }
      n.rowIndex = next;
      n.phase = "step";
      n.tx = offsets[n.rowIndex];
      n.tz = n.zDir > 0 ? half : -half; // stay at this headland while shuffling over
    } else {
      // Arrived at the new row's entry: flip direction and drive its length.
      n.zDir = (n.zDir * -1) as 1 | -1;
      n.phase = "traverse";
      n.tx = offsets[n.rowIndex];
      n.tz = n.zDir > 0 ? half : -half;
    }
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
      sensorNoise
    } = useSimStore.getState();

    if (resetToken !== lastReset.current) {
      lastReset.current = resetToken;
      pose.current = { x: 0, z: 0, heading: 0, battery: 1 };
      nav.current.ready = false;
      wp.current.index = 0;
      wp.current.version = -1; // force a waypoint resync after reset
      clock.current.elapsed = 0;
      g.position.set(0, CHASSIS_Y, 0);
      g.rotation.y = 0;
    }

    const delta = Math.min(rawDelta, 0.05); // don't teleport after a tab-switch
    const p = pose.current;

    clock.current.frames += 1;
    clock.current.frameTime += rawDelta;

    let speed = 0;
    if (dragging) {
      // Picked up: the rover follows the drag target on the ground and nav is
      // suspended. It lifts off the ground (applied in the transform write below).
      p.x = dragTarget.x;
      p.z = dragTarget.z;
      wasDragging.current = true;
    } else {
      // Just dropped → re-plan from the new spot (nearest lane / restart route).
      if (wasDragging.current) {
        wasDragging.current = false;
        nav.current.ready = false;
        wp.current.version = -1;
        wp.current.index = 0;
      }

      if (navMode === "manual") {
      // Direct keyboard control — ignores Run/Pause so you can just drive.
      wp.current.mode = "manual";
      if (p.battery > 0) {
        const turn = (driveInput.left ? 1 : 0) - (driveInput.right ? 1 : 0);
        const throttle = (driveInput.forward ? 1 : 0) - (driveInput.back ? 1 : 0);
        p.heading += turn * MANUAL_TURN * delta;
        if (throttle !== 0) {
          speed = throttle > 0 ? MANUAL_SPEED : -MANUAL_REVERSE;
          p.x += Math.sin(p.heading) * speed * delta;
          p.z += Math.cos(p.heading) * speed * delta;
          p.battery = Math.max(0, p.battery - BATTERY_DRAIN * delta);
          const spin = (speed * delta) / 0.45;
          for (const w of wheels.current) if (w) w.rotation.x += spin;
        }
      }
    } else if (running && p.battery > 0) {
      // Pick this frame's target and what to do on arrival, per nav mode.
      // Per-mode: the point to steer at, and whether we've arrived (to advance).
      let steerX: number | null = null;
      let steerZ = 0;
      let arrived = false;
      let onArrive: (() => void) | null = null;

      if (navMode === "waypoints") {
        wp.current.mode = "waypoints";
        // Resync the cursor when the list is edited (add/clear bumps version).
        if (wp.current.version !== waypointsVersion) {
          wp.current.version = waypointsVersion;
          wp.current.index = 0;
        }
        if (wp.current.index < waypoints.length) {
          const w = waypoints[wp.current.index];
          steerX = w.x;
          steerZ = w.z;
          arrived = Math.hypot(w.x - p.x, w.z - p.z) < WAYPOINT_RADIUS;
          onArrive = () => {
            wp.current.index += 1;
          };
        }
        // No target left → hold position (rover idles at the last waypoint).
      } else {
        // Coverage: re-init the sweep when arriving from another mode.
        if (wp.current.mode !== "coverage") {
          wp.current.mode = "coverage";
          nav.current.ready = false;
        }
        if (!nav.current.ready) initNav();
        const n = nav.current;
        if (n.phase === "traverse") {
          // Pure pursuit: aim at a carrot on the lane centre-line a short way
          // ahead, so any sideways offset (from avoidance or a drag) is corrected
          // straight back onto the row — instead of a shallow diagonal to the end.
          steerX = n.tx; // lane centre-line X
          steerZ = p.z + n.zDir * LOOKAHEAD;
          arrived = n.zDir > 0 ? p.z >= n.tz - WAYPOINT_RADIUS : p.z <= n.tz + WAYPOINT_RADIUS;
        } else {
          // Headland shuffle across to the next lane — a point target is fine.
          steerX = n.tx;
          steerZ = n.tz;
          arrived = Math.hypot(n.tx - p.x, n.tz - p.z) < WAYPOINT_RADIUS;
        }
        onArrive = () => nextWaypoint();
      }

      if (steerX !== null) {
        clock.current.elapsed += delta;

        // Steer toward the point. heading 0 = +Z, so the forward vector is
        // (sin h, cos h) and the bearing to a point is atan2(Δx, Δz).
        const dx = steerX - p.x;
        const dz = steerZ - p.z;
        let desired = Math.atan2(dx, dz);

        // Reactive avoidance off the forward proximity sensor: bias the heading
        // away from obstacles dead ahead. When sensor noise is on, the perceived
        // clearance is jittered — the rover steers off noisy ranging, not truth.
        let avoidBias = 0;
        for (const o of obstacles) {
          const trueClear = Math.hypot(o.x - p.x, o.z - p.z) - o.radius;
          const clear = sensorNoise ? trueClear + (Math.random() - 0.5) * 0.3 : trueClear;
          if (clear > AVOID_RANGE) continue;
          const rel = angleTo(p.heading, Math.atan2(o.x - p.x, o.z - p.z));
          if (Math.abs(rel) > AVOID_CONE) continue; // not in our path
          const strength = (AVOID_RANGE - clear) / AVOID_RANGE; // 0..1, nearer = stronger
          avoidBias += (rel >= 0 ? -1 : 1) * strength * AVOID_GAIN; // steer opposite side
        }
        desired += avoidBias;

        const err = angleTo(p.heading, desired);

        const maxTurn = TURN_RATE * delta;
        p.heading += Math.max(-maxTurn, Math.min(maxTurn, err));

        // Slow through sharp turns (steer first, then accelerate down the row).
        const factor = Math.max(MIN_SPEED_FACTOR, Math.cos(err));
        speed = DRIVE_SPEED * factor;

        p.x += Math.sin(p.heading) * speed * delta;
        p.z += Math.cos(p.heading) * speed * delta;

        if (arrived && onArrive) onArrive();

        p.battery = Math.max(0, p.battery - BATTERY_DRAIN * delta);

        const spin = (speed * delta) / 0.45;
        for (const w of wheels.current) if (w) w.rotation.x += spin;
      }
      }
    }

    // Single authoritative transform write — lifts the rover while it's picked up.
    g.position.set(p.x, dragging ? CHASSIS_Y + DRAG_LIFT : CHASSIS_Y, p.z);
    g.rotation.y = p.heading;

    // Publish live pose for the physics collider + planning (every frame, even
    // when paused, so the kinematic collider stays put on the rover).
    roverPose.x = p.x;
    roverPose.z = p.z;
    roverPose.heading = p.heading;
    roverPose.speed = speed;

    // Throttle telemetry to ~6.7Hz so the HUD isn't re-rendering every frame.
    clock.current.sample += rawDelta;
    if (clock.current.sample >= 0.15) {
      const fps = clock.current.frames / clock.current.frameTime;
      pushTelemetry(
        {
          position: { x: p.x, y: CHASSIS_Y, z: p.z },
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

  const wheelPositions: [number, number, number][] = [
    [-0.62, -0.2, 0.7],
    [0.62, -0.2, 0.7],
    [-0.62, -0.2, -0.7],
    [0.62, -0.2, -0.7]
  ];

  // Pick up the rover: seed the drag target at its current spot and flip the
  // store into dragging (the drag-catcher plane takes over from here).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragTarget.x = pose.current.x;
    dragTarget.z = pose.current.z;
    useSimStore.getState().setDragging(true);
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
      position={[0, CHASSIS_Y, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Drive base */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 0.5, 2.1]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Accent stripe / deck */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[1.3, 0.12, 1.8]} />
        <meshStandardMaterial color="#3f6f5f" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Sensor mast + camera head (forward = +Z) */}
      <mesh castShadow position={[0, 0.75, 0.35]}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 12]} />
        <meshStandardMaterial color="#2a2f33" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0.5]}>
        <boxGeometry args={[0.34, 0.22, 0.22]} />
        <meshStandardMaterial color="#1d2226" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Camera lens (forward-facing) */}
      <mesh position={[0, 1.05, 0.63]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
        <meshStandardMaterial color="#8fd0ff" emissive="#2a6f9e" emissiveIntensity={0.6} />
      </mesh>
      {/* Onboard camera — parented here so it inherits the rover's pose. R3F
          cameras look down local -Z, so yaw 180° to face the rover's forward
          (+Z). Rendered as the picture-in-picture feed by <OnboardView />. */}
      <perspectiveCamera
        ref={(c) => {
          onboardCameraRef.current = c;
        }}
        position={[0, 1.0, 0.62]}
        rotation={[0, Math.PI, 0]}
        fov={62}
        near={0.1}
        far={800}
      />
      {/* Wheels */}
      {wheelPositions.map((wp, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) wheels.current[i] = m;
          }}
          position={wp}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.32, 0.32, 0.24, 20]} />
          <meshStandardMaterial color="#20242a" roughness={0.85} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}
