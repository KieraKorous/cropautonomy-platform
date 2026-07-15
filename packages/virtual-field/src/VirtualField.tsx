"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

import { Hud } from "./hud/Hud";
import { useDriveControls } from "./scene/driveInput";
import { Scene } from "./scene/Scene";

export interface VirtualFieldProps {
  /** Optional extra classes for the outer wrapper (defaults to filling its parent). */
  className?: string;
}

// Public entry point for the simulator: an R3F canvas + the DOM HUD overlay,
// sized to fill its container. Mount it inside a positioned, sized box. This
// component is client-only (WebGL) — consumers in Next should load it with
// `dynamic(..., { ssr: false })`.
export function VirtualField({ className }: VirtualFieldProps) {
  useDriveControls(); // WASD / arrow-key manual driving
  return (
    <div
      id="virtual-field-root"
      className={`relative h-full w-full overflow-hidden bg-base-200 ${className ?? ""}`}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [22, 16, 26], fov: 50, near: 0.1, far: 2000 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Hud />
    </div>
  );
}
