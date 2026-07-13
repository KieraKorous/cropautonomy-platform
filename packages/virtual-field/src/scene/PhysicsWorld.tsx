import {
  CuboidCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody
} from "@react-three/rapier";
import { useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { roverPose } from "./roverState";
import type { Obstacle } from "../obstacle";
import { useSimStore } from "../store/simStore";

// An invisible kinematic body that mirrors the rover's nav pose. The rover mesh
// itself is drawn (and driven) by <Robot> outside physics; this collider is what
// actually shoves dynamic obstacles. Kinematic targets are set in the
// before-step hook so Rapier applies them on the same tick.
function RoverCollider() {
  const ref = useRef<RapierRigidBody>(null);
  const q = useMemo(() => new Quaternion(), []);
  const yAxis = useMemo(() => new Vector3(0, 1, 0), []);

  useBeforePhysicsStep(() => {
    const rb = ref.current;
    if (!rb) return;
    rb.setNextKinematicTranslation({ x: roverPose.x, y: 0.55, z: roverPose.z });
    q.setFromAxisAngle(yAxis, roverPose.heading);
    rb.setNextKinematicRotation(q);
  });

  return (
    <RigidBody ref={ref} type="kinematicPosition" colliders={false}>
      <CuboidCollider args={[0.75, 0.4, 1.05]} />
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

  return (
    <Physics gravity={[0, -9.81, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[fieldSize / 2, 0.5, fieldSize / 2]} position={[0, -0.5, 0]} />
      </RigidBody>
      {obstacles.map((o) => (
        <ObstacleBody key={o.id} o={o} />
      ))}
      <RoverCollider />
    </Physics>
  );
}
