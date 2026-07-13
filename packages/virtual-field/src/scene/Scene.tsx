import { OrbitControls } from "@react-three/drei";

import { Crops } from "./Crops";
import { ENV_PRESETS } from "./environment";
import { Ground } from "./Ground";
import { Lighting } from "./Lighting";
import { Robot } from "./Robot";
import { useSimStore } from "../store/simStore";

// Everything inside the R3F <Canvas>. Reads environment + toggle state from the
// store; the robot drives itself off the same store inside its own useFrame.
export function Scene() {
  const timeOfDay = useSimStore((s) => s.timeOfDay);
  const showGrid = useSimStore((s) => s.showGrid);
  const showRows = useSimStore((s) => s.showRows);
  const showCrops = useSimStore((s) => s.showCrops);
  const field = useSimStore((s) => s.field);

  const preset = ENV_PRESETS[timeOfDay];

  return (
    <>
      <color attach="background" args={[preset.background]} />
      <fog attach="fog" args={[preset.fog.color, preset.fog.near, preset.fog.far]} />

      <Lighting preset={preset} />
      <Ground field={field} preset={preset} showGrid={showGrid} showRows={showRows} />
      {showCrops ? <Crops field={field} /> : null}
      <Robot field={field} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={field.size * 1.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 1, 0]}
      />
    </>
  );
}
