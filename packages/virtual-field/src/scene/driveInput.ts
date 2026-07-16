import { useEffect } from "react";

import { useSimStore } from "../store/simStore";

// Shared manual-control input, written by the keyboard listener and read by the
// Device render loop. A plain mutable object (no React re-renders) — the same
// pattern as devicePose.
//
// Ground devices use forward/back/left/right. Aerial devices add strafe (Q/E) and
// climb/descend (R/F) — chosen over Space/Shift to dodge browser scroll + chords.
export const driveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  strafeL: false,
  strafeR: false,
  up: false,
  down: false
};

function setKey(code: string, down: boolean): boolean {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      driveInput.forward = down;
      return true;
    case "KeyS":
    case "ArrowDown":
      driveInput.back = down;
      return true;
    case "KeyA":
    case "ArrowLeft":
      driveInput.left = down;
      return true;
    case "KeyD":
    case "ArrowRight":
      driveInput.right = down;
      return true;
    case "KeyQ":
      driveInput.strafeL = down;
      return true;
    case "KeyE":
      driveInput.strafeR = down;
      return true;
    case "KeyR":
      driveInput.up = down;
      return true;
    case "KeyF":
      driveInput.down = down;
      return true;
    default:
      return false;
  }
}

function clearInput() {
  driveInput.forward = false;
  driveInput.back = false;
  driveInput.left = false;
  driveInput.right = false;
  driveInput.strafeL = false;
  driveInput.strafeR = false;
  driveInput.up = false;
  driveInput.down = false;
}

// Attaches the manual-control listeners. Keys are always tracked, but a Device
// only acts on them in "manual" mode; we only preventDefault (to stop arrow-key
// page scroll) while manual mode is active.
export function useDriveControls() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (setKey(e.code, true) && useSimStore.getState().navMode === "manual") {
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => setKey(e.code, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clearInput);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearInput);
      clearInput();
    };
  }, []);
}
