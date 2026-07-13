import { Sky } from "@react-three/drei";

import type { EnvPreset } from "./environment";

// Sun + fill lighting for the current time-of-day preset. The directional light
// casts the scene's only shadow map (kept to one caster for perf — 60fps desktop
// target). Hemisphere light approximates soft sky/ground bounce so the shadowed
// side of the robot doesn't go pure black.
export function Lighting({ preset }: { preset: EnvPreset }) {
  return (
    <>
      <Sky
        sunPosition={preset.sunPosition}
        turbidity={preset.background === "#0e141d" ? 12 : 6}
        rayleigh={preset.sunIntensity < 0.5 ? 0.4 : 2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
        distance={450000}
      />
      <hemisphereLight
        args={["#eaf0f2", preset.soil, preset.hemiIntensity]}
      />
      <ambientLight intensity={preset.ambientIntensity} />
      <directionalLight
        position={preset.lightPosition}
        intensity={preset.sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={-0.0004}
      />
    </>
  );
}
