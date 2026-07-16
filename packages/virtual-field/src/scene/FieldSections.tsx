import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import { blockExtent, rowHalfLength } from "./field";
import { VIZ_LAYER } from "./layers";
import { deviceSpec } from "../device";
import { peerIndex } from "../devices/fleet";
import { useSimStore } from "../store/simStore";

// Tints the field into the sections each *ground* device is responsible for,
// coloured to match that device's deck — a legible "who covers what" overlay.
//
// Only ground devices are tinted, and only when two or more of them share the
// field: a lone rover covers everything, so a tint would be a lie. Aerial devices
// get no ground tint either — their block is a flight assignment, not a ground
// region. Lives on the viz layer so it never bleeds into the camera feed /
// captures, and opts out of raycasting so ground clicks still land.
export function FieldSections() {
  const field = useSimStore((s) => s.field);
  const devices = useSimStore((s) => s.devices);
  const groupRef = useRef<Group>(null);

  const sections = useMemo(() => {
    const half = rowHalfLength(field);
    const out: { cx: number; width: number; length: number; color: string }[] = [];

    devices.forEach((kind, i) => {
      const spec = deviceSpec(kind);
      if (spec.flies) return; // aerial assignments aren't ground regions
      const peer = peerIndex(devices, i);
      if (peer.count <= 1) return; // nothing is being divided — don't imply it is
      const extent = blockExtent(field, peer.ordinal, peer.count);
      if (!extent) return;
      const [minX, maxX] = extent;
      out.push({
        cx: (minX + maxX) / 2,
        width: maxX - minX,
        length: half * 2,
        // Same accent the device's own deck uses, so the match is obvious.
        color: spec.colors[i % spec.colors.length]
      });
    });
    return out;
  }, [field, devices]);

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
