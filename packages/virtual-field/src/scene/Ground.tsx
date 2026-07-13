import { Grid } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";

import type { EnvPreset } from "./environment";
import { rowHalfLength, rowOffsets } from "./field";
import { useSimStore } from "../store/simStore";
import type { FieldConfig } from "../types";

// The field floor: a shadow-receiving soil plane, an optional technical grid
// (industrial framing, reads as "engineering sandbox"), and optional furrow
// ridges that hint at crop rows. The ridges are *ground detail*, not the crop
// entity system — that arrives in Phase 3 and will sit on top of these rows.
export function Ground({
  field,
  preset,
  showGrid,
  showRows
}: {
  field: FieldConfig;
  preset: EnvPreset;
  showGrid: boolean;
  showRows: boolean;
}) {
  const offsets = useMemo(() => rowOffsets(field), [field]);
  const ridgeLength = rowHalfLength(field) * 2;

  // In waypoints mode, a click on the soil drops a navigation target at the hit
  // point. Read the store imperatively so the ground doesn't re-render on mode
  // changes. No-op in coverage mode.
  const onSoilClick = (e: ThreeEvent<MouseEvent>) => {
    const { navMode, addWaypoint } = useSimStore.getState();
    if (navMode !== "waypoints") return;
    e.stopPropagation();
    addWaypoint(e.point.x, e.point.z);
  };

  return (
    <group>
      {/* Soil plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onSoilClick}>
        <planeGeometry args={[field.size, field.size]} />
        <meshStandardMaterial color={preset.soil} roughness={1} metalness={0} />
      </mesh>

      {/* Technical grid overlay */}
      {showGrid ? (
        <Grid
          args={[field.size, field.size]}
          position={[0, 0.02, 0]}
          cellSize={field.rowSpacing}
          cellThickness={0.6}
          cellColor="#3d4b52"
          sectionSize={field.rowSpacing * 5}
          sectionThickness={1.1}
          sectionColor="#5b7f74"
          fadeDistance={field.size * 1.4}
          fadeStrength={1.5}
          infiniteGrid={false}
          followCamera={false}
        />
      ) : null}

      {/* Furrow ridges (crop-row hint) */}
      {showRows
        ? offsets.map((x, i) => (
            <mesh key={i} position={[x, 0.12, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.35, 0.24, ridgeLength]} />
              <meshStandardMaterial
                color={preset.soil}
                roughness={1}
                metalness={0}
                emissive="#000000"
              />
            </mesh>
          ))
        : null}
    </group>
  );
}
