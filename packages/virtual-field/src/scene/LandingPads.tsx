import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import { deviceDock } from "./field";
import { VIZ_LAYER } from "./layers";
import { deviceSpec } from "../device";
import { peerIndex } from "../devices/fleet";
import { useSimStore } from "../store/simStore";

// A marked pad under every device's dock — the spot it spawns on and returns to.
// Aerial pads get a helipad ring so a drone visibly takes off from and lands on
// something. Lives on the viz layer, so pads never appear in a device's camera
// feed or a captured dataset frame.
export function LandingPads() {
  const field = useSimStore((s) => s.field);
  const devices = useSimStore((s) => s.devices);
  const groupRef = useRef<Group>(null);

  const pads = useMemo(
    () =>
      devices.map((kind, i) => {
        const spec = deviceSpec(kind);
        const peer = peerIndex(devices, i);
        const dock = deviceDock(field, peer.ordinal, peer.count, spec.dockSetback);
        return {
          x: dock.x,
          z: dock.z,
          aerial: spec.flies,
          color: spec.colors[i % spec.colors.length]
        };
      }),
    [devices, field]
  );

  useLayoutEffect(() => {
    groupRef.current?.traverse((o) => o.layers.set(VIZ_LAYER));
  });

  return (
    <group ref={groupRef}>
      {pads.map((p, i) => (
        <group key={i} position={[p.x, 0.04, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <circleGeometry args={[p.aerial ? 2.2 : 1.6, 28]} />
            <meshBasicMaterial color={p.color} transparent opacity={0.22} depthWrite={false} />
          </mesh>
          {/* Helipad ring marks an aerial pad */}
          {p.aerial ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => null}>
              <ringGeometry args={[1.5, 1.7, 28]} />
              <meshBasicMaterial color={p.color} transparent opacity={0.55} depthWrite={false} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}
