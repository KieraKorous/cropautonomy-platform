import { Grid } from "@react-three/drei";
import { useMemo } from "react";

import type { EnvPreset } from "./environment";
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
  const rowOffsets = useMemo(() => {
    const span = (field.rows - 1) * field.rowSpacing;
    return Array.from({ length: field.rows }, (_, i) => i * field.rowSpacing - span / 2);
  }, [field.rows, field.rowSpacing]);

  const ridgeLength = Math.min(field.size * 0.9, field.size - 8);

  return (
    <group>
      {/* Soil plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
        ? rowOffsets.map((x, i) => (
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
