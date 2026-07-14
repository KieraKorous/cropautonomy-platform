import { useEffect } from "react";

import { useSimStore } from "../store/simStore";

// Shared manual-drive input, written by the keyboard listener and read by the
// Robot's render loop. A plain mutable object (no React re-renders) — the same
// pattern as roverPose.
export const driveInput = { forward: false, back: false, left: false, right: false };

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
    default:
      return false;
  }
}

function clearInput() {
  driveInput.forward = false;
  driveInput.back = false;
  driveInput.left = false;
  driveInput.right = false;
}

// Attaches WASD / arrow-key listeners for manual driving. Keys are always tracked,
// but the Robot only acts on them in "manual" mode; we only preventDefault (to
// stop arrow-key page scroll) while manual mode is active.
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
