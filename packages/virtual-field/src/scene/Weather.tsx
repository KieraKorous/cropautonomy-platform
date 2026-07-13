import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Points } from "three";

import { useSimStore } from "../store/simStore";

const FIELD = 130; // particle field a touch wider than the ground
const TOP = 44;

// Fills a Float32 position buffer with particles randomly distributed through the
// weather volume. Math.random is fine here — weather is ambient, not something
// that needs to be reproducible like crop generation.
function seedParticles(count: number): Float32Array {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (Math.random() - 0.5) * FIELD;
    p[i * 3 + 1] = Math.random() * TOP;
    p[i * 3 + 2] = (Math.random() - 0.5) * FIELD;
  }
  return p;
}

// Falling rain: fast vertical drop with a bit of wind lean; recycled to the top
// when it hits the ground.
function Rain() {
  const ref = useRef<Points>(null);
  const count = 2200;
  const positions = useMemo(() => seedParticles(count), [count]);

  useFrame((_, rawDelta) => {
    const p = ref.current;
    if (!p) return;
    const dt = Math.min(rawDelta, 0.05);
    const arr = p.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= 58 * dt;
      arr[i * 3] += 7 * dt; // wind lean
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = TOP;
        arr[i * 3] = (Math.random() - 0.5) * FIELD;
        arr[i * 3 + 2] = (Math.random() - 0.5) * FIELD;
      } else if (arr[i * 3] > FIELD / 2) {
        arr[i * 3] -= FIELD;
      }
    }
    p.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#aebfce"
        size={0.16}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Wind-blown dust: slow fall, strong horizontal drift, warm tone; recycled across
// the field as it blows past the downwind edge.
function Dust() {
  const ref = useRef<Points>(null);
  const count = 1400;
  const positions = useMemo(() => seedParticles(count), [count]);

  useFrame((_, rawDelta) => {
    const p = ref.current;
    if (!p) return;
    const dt = Math.min(rawDelta, 0.05);
    const arr = p.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] += 11 * dt; // drift downwind
      arr[i * 3 + 1] -= 2 * dt;
      if (arr[i * 3] > FIELD / 2) arr[i * 3] -= FIELD;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = Math.random() * TOP * 0.5 + 4;
    }
    p.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#cdae7d"
        size={0.5}
        transparent
        opacity={0.28}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Particle layer for the active weather. Clear/cloudy/fog carry no particles —
// they're expressed purely through lighting + fog (see applyWeather).
export function Weather() {
  const weather = useSimStore((s) => s.weather);
  if (weather === "rain") return <Rain />;
  if (weather === "dust") return <Dust />;
  return null;
}
