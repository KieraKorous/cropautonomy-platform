import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { WebGLRenderTarget } from "three";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

import { observeAi, resetAnalytics } from "../ai/analytics";
import { runInference } from "../ai/inference";
import { onboardCameraRef } from "./onboardCamera";
import { PIP } from "./OnboardView";
import type { Crop } from "../crop";
import { useSimStore } from "../store/simStore";
import { projectDetections } from "../vision/detections";

const OVERLAY_INTERVAL = 0.12; // s → ~8Hz detection overlay refresh
const CAPTURE_W = 640;
const CAPTURE_H = Math.round((CAPTURE_W * PIP.h) / PIP.w);

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Renders the onboard camera to an offscreen target, reads it back as a PNG, and
// pairs it with exact bounding-box labels projected from the crop records — one
// labelled dataset frame, downloaded as image + COCO-ish JSON.
function captureFrame(gl: WebGLRenderer, scene: Scene, cam: PerspectiveCamera, crops: Crop[]) {
  const rt = new WebGLRenderTarget(CAPTURE_W, CAPTURE_H);
  const savedAspect = cam.aspect;
  cam.aspect = CAPTURE_W / CAPTURE_H;
  cam.updateProjectionMatrix();

  gl.setRenderTarget(rt);
  gl.setViewport(0, 0, CAPTURE_W, CAPTURE_H);
  gl.render(scene, cam);
  const buf = new Uint8Array(CAPTURE_W * CAPTURE_H * 4);
  gl.readRenderTargetPixels(rt, 0, 0, CAPTURE_W, CAPTURE_H, buf);
  gl.setRenderTarget(null);
  rt.dispose();

  // Labels from the same camera pose (matrices are fresh post-render).
  const dets = projectDetections(cam, crops, {
    maxDistance: 26,
    maxCount: 300,
    minArea: 0.0004
  });
  cam.aspect = savedAspect;
  cam.updateProjectionMatrix();

  // Encode the pixel buffer to PNG (WebGL is bottom-up, so flip rows).
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_W;
  canvas.height = CAPTURE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(CAPTURE_W, CAPTURE_H);
  const rowBytes = CAPTURE_W * 4;
  for (let y = 0; y < CAPTURE_H; y++) {
    const src = (CAPTURE_H - 1 - y) * rowBytes;
    img.data.set(buf.subarray(src, src + rowBytes), y * rowBytes);
  }
  ctx.putImageData(img, 0, 0);
  const png = canvas.toDataURL("image/png");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `virtual-field-${stamp}`;
  const annotation = {
    image: `${base}.png`,
    width: CAPTURE_W,
    height: CAPTURE_H,
    camera: { fovDeg: cam.fov, aspect: CAPTURE_W / CAPTURE_H },
    detections: dets.map((d) => ({
      class: d.species,
      bbox: [
        Math.round(d.x * CAPTURE_W),
        Math.round(d.y * CAPTURE_H),
        Math.round(d.w * CAPTURE_W),
        Math.round(d.h * CAPTURE_H)
      ],
      bboxNormalized: [
        +d.x.toFixed(4),
        +d.y.toFixed(4),
        +d.w.toFixed(4),
        +d.h.toFixed(4)
      ],
      attributes: {
        growthStage: d.growthStage,
        health: +d.health.toFixed(2),
        diseased: d.diseased,
        fruitCount: d.fruitCount,
        distanceM: +d.distance.toFixed(2)
      }
    }))
  };

  triggerDownload(png, `${base}.png`);
  const jsonUrl = URL.createObjectURL(
    new Blob([JSON.stringify(annotation, null, 2)], { type: "application/json" })
  );
  triggerDownload(jsonUrl, `${base}.json`);
  URL.revokeObjectURL(jsonUrl);
}

// Drives CV dataset generation: live detection boxes for the HUD overlay, and the
// on-demand capture that writes a labelled frame to disk.
export function Vision() {
  const acc = useRef(0);
  const resetSeen = useRef({ sim: 0, ai: 0 });

  useFrame((state, delta) => {
    const cam = onboardCameraRef.current;
    if (!cam) return;
    const {
      showDetections,
      aiRunning,
      captureRequested,
      crops,
      pushDetections,
      pushAi,
      markCaptured,
      resetToken,
      aiResetToken
    } = useSimStore.getState();

    // Clear the accumulated scan on a sim reset or an explicit AI reset.
    if (resetToken !== resetSeen.current.sim || aiResetToken !== resetSeen.current.ai) {
      resetSeen.current.sim = resetToken;
      resetSeen.current.ai = aiResetToken;
      resetAnalytics();
    }

    if (showDetections || aiRunning) {
      acc.current += delta;
      if (acc.current >= OVERLAY_INTERVAL) {
        acc.current = 0;
        const dets = projectDetections(cam, crops, {
          maxDistance: 22,
          maxCount: 80,
          minArea: 0.0006
        });
        if (showDetections) pushDetections(dets);
        if (aiRunning) {
          const preds = runInference(dets);
          pushAi(preds, observeAi(preds));
        }
      }
    }

    if (captureRequested) {
      captureFrame(state.gl, state.scene, cam, crops);
      markCaptured();
    }
  });

  return null;
}
