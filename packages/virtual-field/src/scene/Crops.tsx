import { useLayoutEffect, useRef } from "react";
import { Color, Object3D, type InstancedMesh } from "three";

import { SPECIES } from "../crop";
import { useSimStore } from "../store/simStore";

const SOIL_TOP = 0.12; // beds sit slightly proud of the ground plane

// Renders the crop layer *from the entity records* in the store — so what you see
// is exactly the data the sim holds (and that future sensor/CV phases query).
// One instanced draw call for the canopy (plus one for trunks on tree species),
// with per-plant transform + colour derived from the record's growth stage,
// health, and disease. Change species / growth / regenerate → the store rebuilds
// the records → this repopulates.
export function Crops() {
  const crops = useSimStore((s) => s.crops);
  const species = useSimStore((s) => s.species);
  const def = SPECIES[species];
  const isTree = def.geometry === "tree";

  const canopyRef = useRef<InstancedMesh>(null);
  const trunkRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    if (!canopy) return;
    const dummy = new Object3D();
    const color = new Color();

    crops.forEach((c, i) => {
      const growth = c.height / def.matureHeight;

      if (def.geometry === "cone") {
        const r = c.boundingRadius;
        dummy.position.set(c.x, SOIL_TOP + c.height / 2, c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.set(r, c.height, r);
      } else if (def.geometry === "sphere") {
        const r = c.boundingRadius;
        dummy.position.set(c.x, SOIL_TOP + r * 0.85, c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.set(r, r * 0.9, r);
      } else {
        // tree canopy sits atop the trunk
        const r = c.boundingRadius;
        const trunk = def.trunkHeight * growth;
        dummy.position.set(c.x, SOIL_TOP + trunk + r * 0.75, c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.set(r, r, r);
      }
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);

      // Colour: dead → brown; otherwise a green whose hue slides toward yellow and
      // whose saturation falls as health drops. Disease dulls it further.
      if (c.growthStage === "dead") {
        color.setHSL(0.09, 0.35, 0.24);
      } else {
        const hue = 0.13 + (def.foliageHue - 0.13) * c.health; // unhealthy → yellow
        const sat = (c.diseased ? 0.32 : 0.5) * (0.45 + c.health * 0.55);
        const light = 0.28 + (1 - c.health) * 0.14;
        color.setHSL(hue, sat, light);
      }
      canopy.setColorAt(i, color);
    });
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;

    const trunk = trunkRef.current;
    if (isTree && trunk) {
      crops.forEach((c, i) => {
        const growth = c.height / def.matureHeight;
        const th = def.trunkHeight * growth;
        const tr = c.boundingRadius * 0.14;
        dummy.position.set(c.x, SOIL_TOP + th / 2, c.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(tr, th, tr);
        dummy.updateMatrix();
        trunk.setMatrixAt(i, dummy.matrix);
      });
      trunk.instanceMatrix.needsUpdate = true;
    }
  }, [crops, def, isTree]);

  if (crops.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={canopyRef}
        args={[undefined, undefined, crops.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        raycast={() => null}
      >
        {def.geometry === "cone" ? (
          <coneGeometry args={[1, 1, 6]} />
        ) : (
          <sphereGeometry args={[1, 10, 8]} />
        )}
        <meshStandardMaterial roughness={0.85} metalness={0} />
      </instancedMesh>

      {isTree ? (
        <instancedMesh
          ref={trunkRef}
          args={[undefined, undefined, crops.length]}
          castShadow
          frustumCulled={false}
          raycast={() => null}
        >
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color="#6b4f36" roughness={1} metalness={0} />
        </instancedMesh>
      ) : null}
    </group>
  );
}
