import type { ThreeEvent } from "@react-three/fiber";
import { useEffect } from "react";

import { devicePose, dragTarget } from "./deviceState";
import { useSimStore } from "../store/simStore";

// While the rover is being dragged, this large invisible ground-plane catches
// pointer movement and maps it to a world X/Z (the drop location under the
// cursor). It only exists during a drag, so it never intercepts normal clicks
// (e.g. dropping waypoints). A window pointer-up ends the drag even if the
// release happens off the plane / outside the canvas.
export function DragPlane() {
  const dragging = useSimStore((s) => s.dragging);
  const setDragging = useSimStore((s) => s.setDragging);

  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      setDragging(false);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, [dragging, setDragging]);

  if (!dragging) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragTarget.x = e.point.x;
    dragTarget.y = devicePose.y; // hold the altitude it was grabbed at
    dragTarget.z = e.point.z;
  };

  // The catcher sits at the device's *current* altitude, not on the soil — drag a
  // drone at 12m against a ground plane and cursor parallax makes it lag/lead the
  // pointer. At its own height the drag stays exact, and it holds altitude.
  return (
    <mesh
      position={[0, devicePose.y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={onMove}
    >
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
