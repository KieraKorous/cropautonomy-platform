import {
  CuboidCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody
} from "@react-three/rapier";
import { useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { deviceRuntimes } from "./deviceState";
import { deviceSpec, type DeviceKind } from "../device";
import type { Obstacle } from "../obstacle";
import { useSimStore } from "../store/simStore";

// An invisible kinematic body that mirrors one device's nav pose. The device mesh
// itself is drawn (and driven) by <Device> outside physics; this collider is what
// actually shoves dynamic obstacles. Kinematic targets are set in the before-step
// hook so Rapier applies them on the same tick.
//
// The collider tracks the runtime's live `y`, so an airborne drone simply floats
// over the barrels instead of bulldozing them — no special-casing needed.
function DeviceCollider({ index, kind }: { index: number; kind: DeviceKind }) {
  const ref = useRef<RapierRigidBody>(null);
  const q = useMemo(() => new Quaternion(), []);
  const yAxis = useMemo(() => new Vector3(0, 1, 0), []);
  const spec = deviceSpec(kind);

  useBeforePhysicsStep(() => {
    const rb = ref.current;
    const rt = deviceRuntimes.get(index);
    if (!rb || !rt) return;
    rb.setNextKinematicTranslation({ x: rt.x, y: rt.y, z: rt.z });
    q.setFromAxisAngle(yAxis, rt.heading);
    rb.setNextKinematicRotation(q);
  });

  return (
    <RigidBody ref={ref} type="kinematicPosition" colliders={false}>
      <CuboidCollider args={[spec.collider.hx, spec.collider.hy, spec.collider.hz]} />
    </RigidBody>
  );
}

// One dynamic rigidbody per obstacle. Barrels are cylinders (convex hull), rocks
// are icosahedra (ball collider). They rest on the ground collider and get pushed
// when the rover drives into them.
function ObstacleBody({ o }: { o: Obstacle }) {
  return (
    <RigidBody
      colliders={o.kind === "barrel" ? "hull" : "ball"}
      position={[o.x, o.radius + 0.05, o.z]}
      friction={0.9}
      restitution={0.05}
      linearDamping={0.4}
      angularDamping={0.6}
    >
      {o.kind === "barrel" ? (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[o.radius, o.radius, o.radius * 2, 14]} />
          <meshStandardMaterial color="#b5563f" roughness={0.6} metalness={0.2} />
        </mesh>
      ) : (
        <mesh castShadow receiveShadow>
          <icosahedronGeometry args={[o.radius, 0]} />
          <meshStandardMaterial color="#7c776b" roughness={0.95} metalness={0} />
        </mesh>
      )}
    </RigidBody>
  );
}

// The physics simulation: a fixed ground collider (the visual ground is drawn
// separately in <Ground>), the dynamic obstacles, and the rover collider.
export function PhysicsWorld({ fieldSize }: { fieldSize: number }) {
  const obstacles = useSimStore((s) => s.obstacles);
  const devices = useSimStore((s) => s.devices);

  return (
    <Physics gravity={[0, -9.81, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[fieldSize / 2, 0.5, fieldSize / 2]} position={[0, -0.5, 0]} />
      </RigidBody>
      {obstacles.map((o) => (
        <ObstacleBody key={o.id} o={o} />
      ))}
      {devices.map((kind, i) => (
        <DeviceCollider key={i} index={i} kind={kind} />
      ))}
    </Physics>
  );
}
