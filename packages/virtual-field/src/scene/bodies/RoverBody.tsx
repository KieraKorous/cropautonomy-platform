import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

import { deviceRuntimes } from "../deviceState";

// GAIA-R: a low four-wheeled drive base with a forward sensor mast.
//
// The body owns its own moving parts: it reads its runtime's live speed and spins
// its wheels itself, so the shared steering code doesn't need to know this device
// has wheels at all.

const WHEEL_POSITIONS: [number, number, number][] = [
  [-0.62, -0.2, 0.7],
  [0.62, -0.2, 0.7],
  [-0.62, -0.2, -0.7],
  [0.62, -0.2, -0.7]
];

export function RoverBody({
  index,
  isActive,
  accent
}: {
  index: number;
  isActive: boolean;
  accent: string;
}) {
  const wheels = useRef<Mesh[]>([]);

  useFrame((_, delta) => {
    const speed = deviceRuntimes.get(index)?.speed ?? 0;
    if (speed === 0) return;
    const spin = (speed * Math.min(delta, 0.05)) / 0.45;
    for (const w of wheels.current) if (w) w.rotation.x += spin;
  });

  return (
    <group>
      {/* Drive base */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.5, 2.1]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Accent deck — brighter on the active device */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[1.3, 0.12, 1.8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 0.5 : 0.1}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      {/* Solar array across the deck — trickle-charges it out in the field */}
      <mesh castShadow position={[0, 0.35, -0.05]}>
        <boxGeometry args={[1.16, 0.03, 1.5]} />
        <meshStandardMaterial color="#111a2e" roughness={0.25} metalness={0.55} />
      </mesh>
      {/* Cell dividers, so it reads as a panel rather than a black slab */}
      {[-0.5, -0.17, 0.16, 0.49].map((z) => (
        <mesh key={z} position={[0, 0.37, z]}>
          <boxGeometry args={[1.16, 0.006, 0.02]} />
          <meshStandardMaterial color="#3d5680" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* Sensor mast + camera head (forward = +Z) */}
      <mesh castShadow position={[0, 0.75, 0.35]}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 12]} />
        <meshStandardMaterial color="#2a2f33" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0.5]}>
        <boxGeometry args={[0.34, 0.22, 0.22]} />
        <meshStandardMaterial color="#1d2226" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Camera lens */}
      <mesh position={[0, 1.05, 0.63]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
        <meshStandardMaterial color="#8fd0ff" emissive="#2a6f9e" emissiveIntensity={0.6} />
      </mesh>
      {/* Wheels */}
      {WHEEL_POSITIONS.map((wp, i) => (
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
