import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

import { useSimStore } from "../store/simStore";
import type { FieldConfig } from "../types";

const DRIVE_SPEED = 3.2; // m/s
const TURN_RATE = 1.4; // rad/s while re-aligning at a boundary
const BATTERY_DRAIN = 0.004; // charge per second while driving
const CHASSIS_Y = 0.55; // drive-base height above soil

// Placeholder robot: a low four-wheeled drive base with a sensor mast. Phase 1
// only needs it to *exist* and prove the sim loop is live, so it drives forward
// and lane-changes at the field boundary (a stand-in — real waypoint/row-follow
// navigation is Phase 2). All motion is integrated imperatively in useFrame and
// applied straight to the mesh; only a throttled sample reaches the React store.
export function Robot({ field }: { field: FieldConfig }) {
  const group = useRef<Group>(null);
  const wheels = useRef<Mesh[]>([]);

  // Imperative pose state — never triggers a React render.
  const pose = useRef({ x: 0, z: 0, heading: 0, battery: 1, turning: false });
  const clock = useRef({ elapsed: 0, sample: 0, frames: 0, frameTime: 0 });
  const lastReset = useRef(0);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;

    const {
      running,
      resetToken,
      pushTelemetry,
      elapsed: storeElapsed
    } = useSimStore.getState();

    // Honour reset() from the store without reaching into the render loop.
    if (resetToken !== lastReset.current) {
      lastReset.current = resetToken;
      pose.current = { x: 0, z: 0, heading: 0, battery: 1, turning: false };
      clock.current.elapsed = 0;
      g.position.set(0, CHASSIS_Y, 0);
      g.rotation.y = 0;
    }

    // Clamp delta so a backgrounded tab doesn't teleport the robot on resume.
    const delta = Math.min(rawDelta, 0.05);
    const p = pose.current;

    // FPS sample (running or not).
    clock.current.frames += 1;
    clock.current.frameTime += rawDelta;

    let speed = 0;
    if (running && p.battery > 0) {
      clock.current.elapsed += delta;
      speed = DRIVE_SPEED;

      const half = field.size / 2 - 6;
      const nextZ = p.z + Math.cos(p.heading) * speed * delta;
      const nextX = p.x + Math.sin(p.heading) * speed * delta;

      // At the boundary, sweep the heading around (and nudge a lane over) instead
      // of driving off the field — a cheap coverage-looking wander for Phase 1.
      if (Math.abs(nextZ) > half || Math.abs(nextX) > half) {
        p.heading += TURN_RATE * delta;
        p.turning = true;
      } else {
        p.x = nextX;
        p.z = nextZ;
        p.turning = false;
      }

      p.battery = Math.max(0, p.battery - BATTERY_DRAIN * delta);

      g.position.set(p.x, CHASSIS_Y, p.z);
      g.rotation.y = p.heading;

      // Spin the wheels proportional to travel.
      const spin = (speed * delta) / 0.45;
      for (const w of wheels.current) if (w) w.rotation.x += spin;
    }

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

  return (
    <group ref={group} position={[0, CHASSIS_Y, 0]}>
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
