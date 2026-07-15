import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Mesh, Points } from "three";

import { VIZ_LAYER } from "./layers";
import { roverPose } from "./roverState";
import { metersToGps } from "../crop";
import { lidarScan } from "../sensors/lidar";
import { buildTargetIndex } from "../sensors/targetIndex";
import { useSimStore } from "../store/simStore";

const RAYS = 96;
const MAX_RANGE = 8; // m
const FORWARD_CONE = 0.22; // rad (~13°) — the "ultrasonic" cone
const SCAN_INTERVAL = 0.08; // s → ~12 Hz sweep (also models sensor latency)
const ACCENT = "#7fe6ff";

// The rover's ranging sensors. A throttled LiDAR sweep (analytic ray-vs-circle
// over the crop/obstacle index) drives the point-cloud viz + the nearest-return
// and ultrasonic readouts; GPS/RTK, IMU yaw-rate, and wheel odometry are derived
// from the live pose. Everything is throttled so the HUD updates a few times a
// second, not every frame.
export function Sensors() {
  const crops = useSimStore((s) => s.crops);
  const obstacles = useSimStore((s) => s.obstacles);
  const showLidar = useSimStore((s) => s.showLidar);

  const index = useMemo(
    () => buildTargetIndex(crops, obstacles, MAX_RANGE),
    [crops, obstacles]
  );

  const pointsRef = useRef<Points>(null);
  const ringRef = useRef<Mesh>(null);
  const positions = useMemo(() => new Float32Array(RAYS * 3), []);

  const acc = useRef({
    prevX: 0,
    prevZ: 0,
    odo: 0,
    scanT: 0,
    lastHeading: 0,
    lastReset: 0
  });

  // Sim-only viz: keep it off the rover's onboard camera + captures.
  useLayoutEffect(() => {
    pointsRef.current?.layers.set(VIZ_LAYER);
    ringRef.current?.layers.set(VIZ_LAYER);
  }, []);

  useFrame((_, rawDelta) => {
    const { x, z, heading } = roverPose;
    const { sensorNoise, rtk, resetToken, pushSensors } = useSimStore.getState();
    const a = acc.current;

    if (resetToken !== a.lastReset) {
      a.lastReset = resetToken;
      a.odo = 0;
      a.prevX = x;
      a.prevZ = z;
      a.lastHeading = heading;
    }

    // Wheel odometry: integrate travelled distance every frame.
    a.odo += Math.hypot(x - a.prevX, z - a.prevZ);
    a.prevX = x;
    a.prevZ = z;

    // Range ring follows the rover.
    if (ringRef.current) ringRef.current.position.set(x, 0.06, z);

    a.scanT += rawDelta;
    if (a.scanT < SCAN_INTERVAL) return;
    const dtScan = a.scanT;
    a.scanT = 0;

    const res = lidarScan(index, x, z, heading, {
      rayCount: RAYS,
      maxRange: MAX_RANGE,
      noise: sensorNoise,
      dropout: sensorNoise ? 0.05 : 0,
      forwardCone: FORWARD_CONE
    });

    // Point-cloud viz: place a point at each ray hit; hide misses far below.
    if (showLidar && pointsRef.current) {
      for (let i = 0; i < RAYS; i++) {
        const ray = res.rays[i];
        if (ray.hit) {
          positions[i * 3] = x + Math.sin(ray.angle) * ray.dist;
          positions[i * 3 + 1] = 0.35;
          positions[i * 3 + 2] = z + Math.cos(ray.angle) * ray.dist;
        } else {
          positions[i * 3 + 1] = -1000;
        }
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // IMU yaw-rate.
    const yawRate =
      Math.atan2(Math.sin(heading - a.lastHeading), Math.cos(heading - a.lastHeading)) /
      Math.max(dtScan, 1e-3);
    a.lastHeading = heading;

    // GPS/RTK: RTK gives ~2cm accuracy, standalone ~2.5m; noise jitters the fix.
    const accuracyM = rtk ? 0.02 : 2.5;
    const jx = sensorNoise ? x + (Math.random() - 0.5) * 2 * accuracyM : x;
    const jz = sensorNoise ? z + (Math.random() - 0.5) * 2 * accuracyM : z;
    const gps = metersToGps(jx, jz);

    pushSensors({
      gps: { lat: gps.lat, lon: gps.lon, accuracyM },
      yawRateDeg: (yawRate * 180) / Math.PI,
      odometerM: a.odo,
      lidarNearest: res.nearest,
      lidarPoints: res.rays.reduce((n, r) => n + (r.hit ? 1 : 0), 0),
      ultrasonic: res.forward
    });
  });

  return (
    <group>
      <points ref={pointsRef} visible={showLidar} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={ACCENT}
          size={0.28}
          sizeAttenuation
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </points>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={showLidar}>
        <ringGeometry args={[MAX_RANGE - 0.08, MAX_RANGE, 72]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}
