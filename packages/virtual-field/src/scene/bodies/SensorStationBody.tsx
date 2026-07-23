import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

// GAIA-S: a fixed field station — a mast on a ground base carrying a solar panel, a
// weather head (camera + anemometer + vane), and soil probes driven into the ground.
//
// Like the rover/drone bodies it owns its own moving parts: the anemometer cups spin
// on their own, so the shared device code knows nothing about them. Unlike them it has
// no locomotion effectors — it never moves — so nothing here reads the runtime speed.

const CUP = 0.09;
const ARM = 0.24;
const ANEMO_SPIN = 1.4; // rad/s — a lazy, always-on turn (it's not a real wind model)

export function SensorStationBody({
  index,
  isActive,
  accent
}: {
  index: number;
  isActive: boolean;
  accent: string;
}) {
  const anemo = useRef<Group>(null);
  // Seed the spin phase off the slot so a bank of stations doesn't turn in lockstep.
  const phase = useRef(index * 1.7);

  useFrame((_, rawDelta) => {
    const g = anemo.current;
    if (!g) return;
    phase.current += ANEMO_SPIN * Math.min(rawDelta, 0.05);
    g.rotation.y = phase.current;
  });

  return (
    <group>
      {/* Ground base — a low foot the mast rises from */}
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.12, 16]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Soil probes — thin rods driven into the ground (moisture + temperature) */}
      {[
        [0.22, 0.16],
        [-0.2, 0.24],
        [0.05, -0.26]
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, -0.22, pz]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.6, 8]} />
          <meshStandardMaterial color="#8a8f96" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Mast */}
      <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.055, 0.07, 2.0, 12]} />
        <meshStandardMaterial color="#d9d4c8" roughness={0.5} metalness={0.25} />
      </mesh>

      {/* Accent band — brighter on the active station, matching the rover/drone cue */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.16, 12]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 0.6 : 0.12}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Solar panel — angled off a short arm partway up the mast, facing the sky */}
      <group position={[0, 1.35, -0.28]} rotation={[-0.5, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.03, 0.5]} />
          <meshStandardMaterial color="#111a2e" roughness={0.25} metalness={0.55} />
        </mesh>
        {/* Cell dividers so it reads as a panel, not a slab */}
        {[-0.24, -0.08, 0.08, 0.24].map((cx) => (
          <mesh key={cx} position={[cx, 0.017, 0]}>
            <boxGeometry args={[0.01, 0.004, 0.48]} />
            <meshStandardMaterial color="#3d5680" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Weather head at the mast top: enclosure + camera lens (forward = +Z) */}
      <mesh castShadow position={[0, 1.98, 0]}>
        <boxGeometry args={[0.26, 0.22, 0.3]} />
        <meshStandardMaterial color="#1d2226" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.95, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
        <meshStandardMaterial color="#8fd0ff" emissive="#2a6f9e" emissiveIntensity={0.6} />
      </mesh>

      {/* Status LED — lit accent when this is the active station */}
      <mesh position={[0, 2.11, 0.12]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 1.6 : 0.4}
        />
      </mesh>

      {/* Anemometer — three cups on arms, spinning gently above the head */}
      <group position={[0, 2.28, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.16, 8]} />
          <meshStandardMaterial color="#2a2f33" roughness={0.6} metalness={0.4} />
        </mesh>
        <group ref={anemo} position={[0, 0.09, 0]}>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            const ax = Math.sin(a) * ARM;
            const az = Math.cos(a) * ARM;
            return (
              <group key={i}>
                <mesh position={[ax / 2, 0, az / 2]} rotation={[0, -a, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.008, 0.008, ARM, 6]} />
                  <meshStandardMaterial color="#2a2f33" roughness={0.6} metalness={0.4} />
                </mesh>
                <mesh position={[ax, 0, az]} castShadow>
                  <sphereGeometry args={[CUP, 10, 8, 0, Math.PI]} />
                  <meshStandardMaterial color="#c9c3b6" roughness={0.5} metalness={0.2} />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
    </group>
  );
}
