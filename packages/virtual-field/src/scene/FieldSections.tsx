import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import { blockExtent, rowHalfLength } from "./field";
import { VIZ_LAYER } from "./layers";
import { ROVER_COLORS } from "./Robot";
import { useSimStore } from "../store/simStore";

// Tints the field into the sections each rover is responsible for, coloured to
// match that rover's deck — a legible "who covers what" overlay. Only shown for a
// multi-rover fleet. Lives on the viz layer so it never bleeds into the rover
// camera feed / captures, and opts out of raycasting so ground clicks still land.
export function FieldSections() {
  const field = useSimStore((s) => s.field);
  const roverCount = useSimStore((s) => s.roverCount);
  const groupRef = useRef<Group>(null);

  const sections = useMemo(() => {
    if (roverCount <= 1) return [];
    const half = rowHalfLength(field);
    const out: { cx: number; width: number; length: number; color: string }[] = [];
    for (let i = 0; i < roverCount; i++) {
      const extent = blockExtent(field, i, roverCount);
      if (!extent) continue;
      const [minX, maxX] = extent;
      out.push({
        cx: (minX + maxX) / 2,
        width: maxX - minX,
        length: half * 2,
        color: ROVER_COLORS[i % ROVER_COLORS.length]
      });
    }
    return out;
  }, [field, roverCount]);

  useLayoutEffect(() => {
    groupRef.current?.traverse((o) => o.layers.set(VIZ_LAYER));
  });

  if (sections.length === 0) return null;

  return (
    <group ref={groupRef}>
      {sections.map((s, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[s.cx, 0.03, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[s.width, s.length]} />
          <meshBasicMaterial color={s.color} transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
