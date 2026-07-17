import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { MeshDepthMaterial } from "three";

import { onboardCameraRef } from "./onboardCamera";
import { useSimStore } from "../store/simStore";

/**
 * Aspect of *captured* dataset frames. Deliberately a constant rather than the
 * live feed's aspect: the user can resize the on-screen feed freely, and that must
 * not change the resolution/framing of the data you export.
 */
export const CAPTURE_ASPECT = 16 / 10;

// Takes over the render loop (priority 1 disables R3F's auto-render) to draw two
// passes each frame: the full orbit view, then the rover's onboard camera into a
// scissored rectangle in the corner — a live "what the robot sees" feed without a
// second canvas or an expensive pixel readback.
// Depth range for the depth-camera view — near/far the depth ramp spans.
const DEPTH_FAR = 55;

export function OnboardView() {
  // A depth material used as a scene override for the depth-camera sensor mode.
  const depthMat = useMemo(() => new MeshDepthMaterial(), []);

  useFrame((state) => {
    const { gl, scene, camera, size } = state;

    // Main view — full framebuffer.
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    // Onboard feed — an inset anchored to the bottom-right, sized and placed by
    // the user (store `pip`). WebGL's origin is bottom-left, so `bottom` maps to y
    // directly. The HUD frame reads the same values, which is what keeps the
    // labelled frame exactly around the feed.
    const cam = onboardCameraRef.current;
    if (!cam) return;
    const { pip, cameraMode } = useSimStore.getState();
    const aspect = pip.w / pip.h;
    if (cam.aspect !== aspect) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    const x = size.width - pip.w - pip.right;
    const y = pip.bottom;
    gl.setViewport(x, y, pip.w, pip.h);
    gl.setScissor(x, y, pip.w, pip.h);
    gl.setScissorTest(true);

    const depth = cameraMode === "depth";
    if (depth) {
      // Compress the camera's far plane so the depth ramp spans the near field,
      // then render the whole scene with the depth override material.
      const savedFar = cam.far;
      cam.far = DEPTH_FAR;
      cam.updateProjectionMatrix();
      scene.overrideMaterial = depthMat;
      gl.render(scene, cam);
      scene.overrideMaterial = null;
      cam.far = savedFar;
      cam.updateProjectionMatrix();
    } else {
      gl.render(scene, cam);
    }

    gl.setScissorTest(false);
  }, 1);

  return null;
}
