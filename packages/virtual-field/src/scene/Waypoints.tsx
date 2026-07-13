import { Line } from "@react-three/drei";

import { useSimStore } from "../store/simStore";

const NEVER_RAYCAST = () => null;
const ACCENT = "#8fd0ff";

// Visual layer for user waypoints: a dashed path threading them in order, plus a
// pin + ground ring at each. Only shown in "waypoints" mode. Markers opt out of
// raycasting so clicking near one still drops a new waypoint on the ground rather
// than hitting the pin.
export function Waypoints() {
  const waypoints = useSimStore((s) => s.waypoints);
  const navMode = useSimStore((s) => s.navMode);

  if (navMode !== "waypoints" || waypoints.length === 0) return null;

  const path = waypoints.map((w) => [w.x, 0.25, w.z] as [number, number, number]);

  return (
    <group>
      {path.length >= 2 ? (
        <Line points={path} color={ACCENT} lineWidth={2} dashed dashSize={0.7} gapSize={0.4} />
      ) : null}

      {waypoints.map((w, i) => (
        <group key={i} position={[w.x, 0, w.z]}>
          <mesh position={[0, 0.6, 0]} raycast={NEVER_RAYCAST}>
            <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
            <meshStandardMaterial color={ACCENT} emissive="#2a6f9e" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, 1.28, 0]} raycast={NEVER_RAYCAST}>
            <sphereGeometry args={[0.17, 16, 16]} />
            <meshStandardMaterial color={ACCENT} emissive="#2a6f9e" emissiveIntensity={0.5} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} raycast={NEVER_RAYCAST}>
            <ringGeometry args={[0.35, 0.5, 24]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
