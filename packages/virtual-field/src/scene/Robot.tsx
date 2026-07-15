import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group, Mesh, PerspectiveCamera } from "three";

import { driveInput } from "./driveInput";
import { blockLanes, roverDock, rowHalfLength } from "./field";
import { onboardCameraRef } from "./onboardCamera";
import { dragTarget, roverPose, roverRuntimes, type RoverRuntime } from "./roverState";
import { planPath } from "../nav/astar";
import { useSimStore } from "../store/simStore";
import type { NavMode } from "../store/simStore";
import type { Waypoint } from "../types";

const DRIVE_SPEED = 3.6; // m/s along a row
const TURN_RATE = 2.1; // rad/s max steering rate
const WAYPOINT_RADIUS = 1.1; // m — "arrived" threshold
const LOOKAHEAD = 4; // m — pure-pursuit carrot distance for rejoining a row
const MIN_SPEED_FACTOR = 0.18; // crawl (not stall) through sharp headland turns
const BATTERY_DRAIN = 0.004; // charge per second while driving
const CHASSIS_Y = 0.55; // drive-base height above soil

// Reactive avoidance: obstacles (and other rovers) within AVOID_RANGE and inside
// a forward cone push the desired heading to the opposite side.
const AVOID_RANGE = 4.2;
const AVOID_CONE = 1.15;
const AVOID_GAIN = 1.5;
const ROVER_RADIUS = 1.1; // treat fleetmates as this-radius obstacles

const MANUAL_SPEED = 4.6;
const MANUAL_REVERSE = 2.6;
const MANUAL_TURN = 1.9;

const DRAG_LIFT = 1.4;

export const MAX_ROVERS = 4;
export const ROVER_COLORS = ["#3f6f5f", "#c1734a", "#4a6fa5", "#9c6b3f"];

// Row-follower navigation over the rover's *assigned* lane block. It steers onto
// the nearest assigned lane, drives its length, then turns into the next — a
// boustrophedon sweep bounded to this rover's region so the fleet divides the
// field. Two phases: traverse (drive Δz down a row) and step (shuffle Δx across
// the headland to the next row).
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

// Shortest signed angle from a to b, in (-π, π].
function angleTo(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function Rover({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const wheels = useRef<Mesh[]>([]);
  const camRef = useRef<PerspectiveCamera | null>(null);

  const field = useSimStore((s) => s.field);
  const roverCount = useSimStore((s) => s.roverCount);
  const activeRover = useSimStore((s) => s.activeRover);
  const isActive = activeRover === index;
  const accent = ROVER_COLORS[index % ROVER_COLORS.length];

  const lanes = useMemo(
    () => blockLanes(field, index, roverCount),
    [field, index, roverCount]
  );
  // Spawn (and return) at the dock on the field's near edge.
  const start = useMemo(
    () => roverDock(field, index, roverCount),
    [field, index, roverCount]
  );

  const pose = useRef({ x: start.x, z: start.z, heading: 0, battery: 1 });
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
  const wp = useRef<{ mode: NavMode; version: number; index: number }>({
    mode: "coverage",
    version: -1,
    index: 0
  });

  // "Return home" state: a planned A* route back to this rover's dock.
  const lastHome = useRef(0);
  const homing = useRef(false);
  const homeIndex = useRef(0);
  const homePath = useRef<Waypoint[]>([]);

  // Register this rover's live pose so fleetmates can avoid it + it gets a collider.
  const runtime = useRef<RoverRuntime>({ x: start.x, z: start.z, heading: 0, speed: 0 });
  useLayoutEffect(() => {
    const rt = runtime.current;
    roverRuntimes.set(index, rt);
    return () => {
      roverRuntimes.delete(index);
    };
  }, [index]);

  // Only the active rover's onboard camera drives the PiP feed / captures.
  useLayoutEffect(() => {
    if (isActive && camRef.current) onboardCameraRef.current = camRef.current;
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
      homeToken
    } = useSimStore.getState();

    const isDragged = dragging && isActive;

    if (resetToken !== lastReset.current) {
      lastReset.current = resetToken;
      pose.current = { x: start.x, z: start.z, heading: 0, battery: 1 };
      nav.current.ready = false;
      wp.current.index = 0;
      wp.current.version = -1;
      clock.current.elapsed = 0;
    }

    const delta = Math.min(rawDelta, 0.05);
    const p = pose.current;
    clock.current.frames += 1;
    clock.current.frameTime += rawDelta;

    let speed = 0;
    let steerX: number | null = null;
    let steerZ = 0;
    let arrived = false;
    let onArrive: (() => void) | null = null;

    if (isDragged) {
      p.x = dragTarget.x;
      p.z = dragTarget.z;
      wasDragging.current = true;
    } else {
      if (wasDragging.current) {
        wasDragging.current = false;
        nav.current.ready = false;
        wp.current.version = -1;
        wp.current.index = 0;
      }

      // Return-home command: plan an A* route to this rover's dock once, then
      // drive it. Overrides the current nav mode until it arrives + docks.
      if (homeToken !== lastHome.current) {
        lastHome.current = homeToken;
        const dock = roverDock(field, index, roverCount);
        homePath.current = planPath(field, obstacles, { x: p.x, z: p.z }, dock);
        homeIndex.current = 0;
        homing.current = homePath.current.length > 0;
      }

      if (homing.current && p.battery > 0) {
        const path = homePath.current;
        if (homeIndex.current < path.length) {
          const w = path[homeIndex.current];
          steerX = w.x;
          steerZ = w.z;
          arrived = Math.hypot(w.x - p.x, w.z - p.z) < WAYPOINT_RADIUS;
          onArrive = () => {
            homeIndex.current += 1;
            if (homeIndex.current >= path.length) homing.current = false; // docked
          };
        } else {
          homing.current = false;
        }
      } else if (navMode === "manual") {
        // Only the active rover takes the keyboard; the rest hold position.
        wp.current.mode = "manual";
        if (isActive && p.battery > 0) {
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
        if (navMode === "waypoints") {
          // Waypoints steer the active rover only; fleetmates hold.
          wp.current.mode = "waypoints";
          if (wp.current.version !== waypointsVersion) {
            wp.current.version = waypointsVersion;
            wp.current.index = 0;
          }
          if (isActive && wp.current.index < waypoints.length) {
            const w = waypoints[wp.current.index];
            steerX = w.x;
            steerZ = w.z;
            arrived = Math.hypot(w.x - p.x, w.z - p.z) < WAYPOINT_RADIUS;
            onArrive = () => {
              wp.current.index += 1;
            };
          }
        } else {
          // Coverage: every rover sweeps its own assigned lane block.
          if (wp.current.mode !== "coverage") {
            wp.current.mode = "coverage";
            nav.current.ready = false;
          }
          if (!nav.current.ready) initNav();
          const n = nav.current;
          if (lanes.length === 0) {
            steerX = null; // no work assigned → idle
          } else if (n.phase === "traverse") {
            steerX = n.tx;
            steerZ = p.z + n.zDir * LOOKAHEAD;
            arrived = n.zDir > 0 ? p.z >= n.tz - WAYPOINT_RADIUS : p.z <= n.tz + WAYPOINT_RADIUS;
          } else {
            steerX = n.tx;
            steerZ = n.tz;
            arrived = Math.hypot(n.tx - p.x, n.tz - p.z) < WAYPOINT_RADIUS;
          }
          onArrive = () => nextWaypoint();
        }
      }

      // Shared steering — drive toward the chosen target (coverage lane /
      // waypoint / home), biasing away from obstacles + fleetmates.
      if (steerX !== null && p.battery > 0) {
        clock.current.elapsed += delta;
        const dx = steerX - p.x;
        const dz = steerZ - p.z;
        let desired = Math.atan2(dx, dz);

        let avoidBias = 0;
        const avoid = (ax: number, az: number, radius: number) => {
          const trueClear = Math.hypot(ax - p.x, az - p.z) - radius;
          const clear = sensorNoise ? trueClear + (Math.random() - 0.5) * 0.3 : trueClear;
          if (clear > AVOID_RANGE) return;
          const rel = angleTo(p.heading, Math.atan2(ax - p.x, az - p.z));
          if (Math.abs(rel) > AVOID_CONE) return;
          const strength = (AVOID_RANGE - clear) / AVOID_RANGE;
          avoidBias += (rel >= 0 ? -1 : 1) * strength * AVOID_GAIN;
        };
        for (const o of obstacles) avoid(o.x, o.z, o.radius);
        for (const [j, r] of roverRuntimes) {
          if (j !== index) avoid(r.x, r.z, ROVER_RADIUS);
        }
        desired += avoidBias;

        const err = angleTo(p.heading, desired);
        const maxTurn = TURN_RATE * delta;
        p.heading += Math.max(-maxTurn, Math.min(maxTurn, err));
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

    g.position.set(p.x, isDragged ? CHASSIS_Y + DRAG_LIFT : CHASSIS_Y, p.z);
    g.rotation.y = p.heading;

    // Publish this rover's live pose; the active one also mirrors into roverPose.
    const rt = runtime.current;
    rt.x = p.x;
    rt.z = p.z;
    rt.heading = p.heading;
    rt.speed = speed;
    if (isActive) {
      roverPose.x = p.x;
      roverPose.z = p.z;
      roverPose.heading = p.heading;
      roverPose.speed = speed;
    }

    clock.current.sample += rawDelta;
    if (clock.current.sample >= 0.15) {
      const fps = clock.current.frames / clock.current.frameTime;
      pushTelemetry(
        index,
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

  // Click a rover to select it (and start dragging). Selecting makes it the
  // camera/sensor/HUD focus.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = useSimStore.getState();
    s.setActiveRover(index);
    dragTarget.x = pose.current.x;
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
      position={[start.x, CHASSIS_Y, start.z]}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Drive base */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.5, 2.1]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Accent deck — brighter when this rover is the active one */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[1.3, 0.12, 1.8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 0.6 : 0.12}
          roughness={0.4}
          metalness={0.3}
        />
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
      <mesh position={[0, 1.05, 0.63]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
        <meshStandardMaterial color="#8fd0ff" emissive="#2a6f9e" emissiveIntensity={0.6} />
      </mesh>
      <perspectiveCamera
        ref={(c) => {
          camRef.current = c;
        }}
        position={[0, 1.0, 0.62]}
        rotation={[0, Math.PI, 0]}
        fov={62}
        near={0.1}
        far={800}
      />
      {wheelPositions.map((wpos, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) wheels.current[i] = m;
          }}
          position={wpos}
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

// The rover fleet. Each rover is an independent agent covering its own block of
// the field; the camera/sensors/AI follow whichever one is active.
export function Fleet() {
  const roverCount = useSimStore((s) => s.roverCount);
  return (
    <>
      {Array.from({ length: roverCount }, (_, i) => (
        <Rover key={i} index={i} />
      ))}
    </>
  );
}
