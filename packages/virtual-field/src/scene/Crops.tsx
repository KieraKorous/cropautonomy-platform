import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, type InstancedMesh } from "three";

import { rowHalfLength, rowOffsets } from "./field";
import type { FieldConfig } from "../types";

const PLANT_SPACING = 1.0; // metres between plants along a row
const HEADLAND_MARGIN = 4; // leave the row ends bare (turning space)
const BASE_HEIGHT = 0.9; // unscaled plant height

// Deterministic PRNG so plant jitter/scale/colour stay stable across re-renders
// (a fresh Math.random() every render would make the field shimmer).
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plant {
  x: number;
  z: number;
  scale: number; // height multiplier — stands in for growth-stage variation
  ry: number; // yaw
  hue: number; // foliage hue jitter
}

// Basic crop layer: a plant on every bed (the furrow rows), instanced into a
// single draw call so thousands of plants stay cheap. This is the visual
// starting point for the PRD crop system — the full per-plant record (species,
// growth stage, health, moisture, fruit count, GPS, id) layers on in Phase 3.
export function Crops({ field }: { field: FieldConfig }) {
  const ref = useRef<InstancedMesh>(null);

  const plants = useMemo<Plant[]>(() => {
    const offsets = rowOffsets(field);
    const usable = rowHalfLength(field) - HEADLAND_MARGIN;
    if (usable <= 0) return [];
    const perRow = Math.max(1, Math.floor((usable * 2) / PLANT_SPACING));
    const rng = makeRng(field.rows * 1000 + Math.round(field.size));

    const out: Plant[] = [];
    for (const ox of offsets) {
      for (let i = 0; i <= perRow; i++) {
        const z = -usable + (i / perRow) * usable * 2;
        out.push({
          x: ox + (rng() - 0.5) * 0.25,
          z: z + (rng() - 0.5) * 0.3,
          scale: 0.7 + rng() * 0.6,
          ry: rng() * Math.PI * 2,
          hue: 0.28 + (rng() - 0.5) * 0.05 // greens, slightly varied
        });
      }
    }
    return out;
  }, [field]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    plants.forEach((p, i) => {
      const width = 0.85 + (p.scale - 0.7) * 0.3;
      dummy.position.set(p.x, 0.12 + (BASE_HEIGHT * p.scale) / 2, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(width, p.scale, width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(p.hue, 0.5, 0.3 + (p.scale - 0.7) * 0.08);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [plants]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, plants.length]}
      castShadow
      receiveShadow
      raycast={() => null}
    >
      <coneGeometry args={[0.22, BASE_HEIGHT, 6]} />
      <meshStandardMaterial roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}
