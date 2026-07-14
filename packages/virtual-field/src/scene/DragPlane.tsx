import type { ThreeEvent } from "@react-three/fiber";
import { useEffect } from "react";

import { dragTarget } from "./roverState";
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
    dragTarget.z = e.point.z;
  };

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onMove}>
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
