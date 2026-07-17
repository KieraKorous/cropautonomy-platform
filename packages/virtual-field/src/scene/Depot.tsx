import { useMemo } from "react";

import { DEPOT, DEPOT_ROOF_Y, depotBay, depotCenter } from "../depot";
import { deviceSpec } from "../device";
import { peerIndex } from "../devices/fleet";
import { useSimStore } from "../store/simStore";

// The shed that houses and charges the fleet. Ground devices park in the
// open-fronted bays; drones land on the roof helipads.
//
// Unlike the sim-only overlays, this is a *real structure* in the world — it
// renders on the default layer, so device cameras and captured dataset frames see
// it, which is correct: it's really there.

const WALL = "#8d8478";
const TRIM = "#5f5a52";
const DECK = "#6f6a62";

export function Depot() {
  const field = useSimStore((s) => s.field);
  const devices = useSimStore((s) => s.devices);

  const c = useMemo(() => depotCenter(field), [field]);
  const { width: W, depth: D, wallHeight: H, roofThickness: RT } = DEPOT;

  // Bay markings + helipads, one per device, laid out exactly where the docks are.
  const bays = useMemo(
    () =>
      devices.map((kind, i) => {
        const spec = deviceSpec(kind);
        const peer = peerIndex(devices, i);
        const bay = depotBay(field, peer.ordinal, peer.count, spec);
        return {
          x: bay.x,
          z: bay.z,
          aerial: spec.flies,
          color: spec.colors[i % spec.colors.length]
        };
      }),
    [devices, field]
  );

  return (
    <group position={[c.x, 0, c.z]}>
      {/* Floor slab — extends a little past the front so devices drive up onto it */}
      <mesh position={[0, 0.02, 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D + 2]} />
        <meshStandardMaterial color={DECK} roughness={0.95} metalness={0} />
      </mesh>

      {/* Back wall (field-facing front is left open so devices drive straight in) */}
      <mesh position={[0, H / 2, -D / 2]} castShadow receiveShadow>
        <boxGeometry args={[W, H, 0.3]} />
        <meshStandardMaterial color={WALL} roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Side walls */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * W) / 2, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, H, D]} />
          <meshStandardMaterial color={WALL} roughness={0.85} metalness={0.05} />
        </mesh>
      ))}

      {/* Roof deck — the drones' landing surface */}
      <mesh position={[0, H + RT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.6, RT, D + 0.6]} />
        <meshStandardMaterial color={TRIM} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Roof parapet, so the helipads read as a deck rather than a slab */}
      {[-1, 1].map((s) => (
        <mesh key={`p${s}`} position={[0, DEPOT_ROOF_Y + 0.15, (s * (D + 0.6)) / 2]}>
          <boxGeometry args={[W + 0.6, 0.3, 0.12]} />
          <meshStandardMaterial color={TRIM} roughness={0.8} />
        </mesh>
      ))}

      {/* Front posts holding the roof over the open bay mouth */}
      {[-1, 1].map((s) => (
        <mesh key={`c${s}`} position={[(s * (W - 0.4)) / 2, H / 2, D / 2]} castShadow>
          <boxGeometry args={[0.34, H, 0.34]} />
          <meshStandardMaterial color={TRIM} roughness={0.7} metalness={0.15} />
        </mesh>
      ))}

      {/* Header beam across the bay mouth */}
      <mesh position={[0, H - 0.25, D / 2]} castShadow>
        <boxGeometry args={[W, 0.5, 0.3]} />
        <meshStandardMaterial color={TRIM} roughness={0.7} metalness={0.15} />
      </mesh>

      {/* Charge posts along the back wall — one per ground bay, so the shed reads
          as somewhere that charges rather than just shelters. */}
      {bays
        .filter((b) => !b.aerial)
        .map((b, i) => (
          <group key={`chg${i}`} position={[b.x - c.x, 0, -D / 2 + 0.6]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.26, 1.1, 0.22]} />
              <meshStandardMaterial color="#2f343a" roughness={0.6} metalness={0.4} />
            </mesh>
            {/* Live indicator */}
            <mesh position={[0, 1.0, 0.13]}>
              <sphereGeometry args={[0.06, 10, 8]} />
              <meshStandardMaterial
                color={b.color}
                emissive={b.color}
                emissiveIntensity={1.4}
              />
            </mesh>
          </group>
        ))}

      {/* Bay markings on the floor / helipad rings on the roof, colour-matched to
          the device that parks there. */}
      {bays.map((b, i) => (
        <group
          key={`bay${i}`}
          position={[b.x - c.x, b.aerial ? DEPOT_ROOF_Y + 0.02 : 0.04, 0]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[b.aerial ? 1.5 : 1.2, b.aerial ? 1.7 : 1.32, 28]} />
            <meshBasicMaterial
              color={b.color}
              transparent
              opacity={b.aerial ? 0.75 : 0.5}
              depthWrite={false}
            />
          </mesh>
          {/* Helipad cross-bar, so a roof pad reads as a pad from the air */}
          {b.aerial ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[1.6, 0.22]} />
              <meshBasicMaterial color={b.color} transparent opacity={0.7} depthWrite={false} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}
