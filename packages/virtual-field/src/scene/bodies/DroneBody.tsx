import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

import { deviceRuntimes } from "../deviceState";

// GAIA-D: a quadcopter — X frame, four rotors, and a downward (nadir) camera
// gimbal under the hull.
//
// Like the rover body, it owns its own moving parts. Rotors don't scale with
// ground speed the way wheels do — they spin fast whenever the aircraft is
// airborne — so the mapping is its own business, not the steering code's.

const ARM = 0.62;
const ROTOR_POSITIONS: [number, number, number][] = [
  [ARM, 0.12, ARM],
  [-ARM, 0.12, ARM],
  [ARM, 0.12, -ARM],
  [-ARM, 0.12, -ARM]
];

const ROTOR_SPIN = 34; // rad/s at full song
const MAX_TILT = 0.26; // ~15° — cosmetic bank/pitch, not a dynamics model

export function DroneBody({
  index,
  isActive,
  accent
}: {
  index: number;
  isActive: boolean;
  accent: string;
}) {
  const rotors = useRef<Mesh[]>([]);
  const tilt = useRef<Group>(null);
  const lastHeading = useRef(0);

  useFrame((_, rawDelta) => {
    const rt = deviceRuntimes.get(index);
    if (!rt) return;
    const delta = Math.min(rawDelta, 0.05);
    const airborne = rt.y > 0.6;

    // Rotors idle on the pad and spin hard in the air.
    const throttle = airborne ? 1 : 0.12;
    const spin = ROTOR_SPIN * throttle * delta;
    for (let i = 0; i < rotors.current.length; i++) {
      const r = rotors.current[i];
      // Counter-rotating pairs, like a real quad.
      if (r) r.rotation.y += i % 2 === 0 ? spin : -spin;
    }

    // Lean into travel + bank into turns. Purely cosmetic, but it's what sells
    // the thing as flying rather than sliding.
    const t = tilt.current;
    if (!t) return;
    const yawRate = Math.atan2(
      Math.sin(rt.heading - lastHeading.current),
      Math.cos(rt.heading - lastHeading.current)
    ) / Math.max(delta, 1e-3);
    lastHeading.current = rt.heading;
    const pitch = airborne ? Math.min(MAX_TILT, (rt.speed / 9) * MAX_TILT) : 0;
    const roll = airborne ? Math.max(-MAX_TILT, Math.min(MAX_TILT, yawRate * 0.18)) : 0;
    // Ease toward the target so gusty yaw doesn't make it twitch.
    t.rotation.x += (pitch - t.rotation.x) * Math.min(1, delta * 4);
    t.rotation.z += (roll - t.rotation.z) * Math.min(1, delta * 4);
  });

  return (
    <group ref={tilt}>
      {/* Hull */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.18, 0.72]} />
        <meshStandardMaterial color="#2b3138" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Accent canopy — brighter on the active device */}
      <mesh castShadow position={[0, 0.13, 0.05]}>
        <boxGeometry args={[0.36, 0.1, 0.44]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 0.55 : 0.12}
          roughness={0.35}
          metalness={0.35}
        />
      </mesh>
      {/* Arms — an X frame under the rotors */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, 0.05, 0]} rotation={[0, (s * Math.PI) / 4, 0]} castShadow>
          <boxGeometry args={[0.07, 0.05, 1.72]} />
          <meshStandardMaterial color="#20252b" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {/* Motors + rotor discs */}
      {ROTOR_POSITIONS.map((rp, i) => (
        <group key={i} position={rp}>
          <mesh castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.12, 10]} />
            <meshStandardMaterial color="#171b20" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh
            ref={(m) => {
              if (m) rotors.current[i] = m;
            }}
            position={[0, 0.09, 0]}
          >
            {/* A thin disc reads as a blur far better than modelled blades */}
            <cylinderGeometry args={[0.42, 0.42, 0.012, 18]} />
            <meshStandardMaterial
              color="#9fb4c8"
              transparent
              opacity={0.35}
              roughness={0.4}
              metalness={0.2}
            />
          </mesh>
        </group>
      ))}
      {/* Nadir camera gimbal — the pod the onboard camera looks out of */}
      <mesh castShadow position={[0, -0.16, 0]}>
        <sphereGeometry args={[0.12, 14, 12]} />
        <meshStandardMaterial color="#1d2226" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.04, 16]} />
        <meshStandardMaterial color="#8fd0ff" emissive="#2a6f9e" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}
