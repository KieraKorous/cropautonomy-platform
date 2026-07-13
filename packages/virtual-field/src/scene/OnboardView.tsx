import { useFrame } from "@react-three/fiber";

import { onboardCameraRef } from "./onboardCamera";

// Picture-in-picture size (CSS px). Kept in sync with the DOM frame the HUD draws
// around it (CameraFeed in Hud.tsx) — both anchor to the bottom-right with the
// same 16px margin, so the WebGL feed sits exactly inside the labelled frame.
export const PIP = { w: 232, h: 148, margin: 16 };

// Takes over the render loop (priority 1 disables R3F's auto-render) to draw two
// passes each frame: the full orbit view, then the rover's onboard camera into a
// scissored rectangle in the corner — a live "what the robot sees" feed without a
// second canvas or an expensive pixel readback.
export function OnboardView() {
  useFrame((state) => {
    const { gl, scene, camera, size } = state;

    // Main view — full framebuffer.
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    // Onboard feed — bottom-right inset. WebGL's origin is bottom-left, so y is
    // just the margin.
    const cam = onboardCameraRef.current;
    if (!cam) return;
    const aspect = PIP.w / PIP.h;
    if (cam.aspect !== aspect) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    const x = size.width - PIP.w - PIP.margin;
    const y = PIP.margin;
    gl.setViewport(x, y, PIP.w, PIP.h);
    gl.setScissor(x, y, PIP.w, PIP.h);
    gl.setScissorTest(true);
    gl.render(scene, cam);
    gl.setScissorTest(false);
  }, 1);

  return null;
}
