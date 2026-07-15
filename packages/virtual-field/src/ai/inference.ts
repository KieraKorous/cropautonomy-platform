import type { CropSpecies } from "../crop";
import type { Detection } from "../vision/detections";

// Simulated on-rover perception model. Where Phase 6 emits perfect ground-truth
// labels, this emits *predictions*: a disease classifier with realistic recall +
// false positives, a fruit-count regressor with estimation error, and per-call
// confidence. Each plant is seeded by its id, so predictions are stable frame to
// frame (a missed disease stays missed) — which keeps the accumulated analytics
// honest and flicker-free. Because the sim also holds ground truth, downstream
// analytics can score the model's real precision/recall.

export interface Prediction {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  species: CropSpecies;
  confidence: number; // 0..1
  predictedDiseased: boolean;
  actualDiseased: boolean;
  fruitEstimate: number;
  actualFruit: number;
  distance: number;
}

export interface ModelParams {
  /** Recall on truly-diseased plants (fraction detected). */
  recall: number;
  /** False-positive rate on healthy plants. */
  falsePositiveRate: number;
  /** Changes the deterministic per-plant draw (a different "model checkpoint"). */
  seed: number;
}

const DEFAULTS: ModelParams = { recall: 0.88, falsePositiveRate: 0.05, seed: 1 };

function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runInference(dets: Detection[], params?: Partial<ModelParams>): Prediction[] {
  const { recall, falsePositiveRate, seed } = { ...DEFAULTS, ...params };

  return dets.map((d) => {
    const rng = mulberry32(hashStr(d.id) ^ (Math.imul(seed, 2654435761) >>> 0));

    // Confidence degrades with distance — the model is less sure far away, and a
    // little more likely to miss.
    const distConf = Math.max(0.4, 1 - d.distance / 26);

    let predictedDiseased: boolean;
    if (d.diseased) {
      predictedDiseased = rng() < recall * (0.7 + 0.3 * distConf);
    } else {
      predictedDiseased = rng() < falsePositiveRate;
    }

    const base = predictedDiseased ? 0.6 + rng() * 0.35 : 0.72 + rng() * 0.26;
    const confidence = Math.max(0, Math.min(1, base * (0.7 + 0.3 * distConf)));

    const actualFruit = d.fruitCount;
    const fruitEstimate =
      actualFruit > 0 ? Math.max(0, Math.round(actualFruit * (0.8 + rng() * 0.4))) : 0;

    return {
      id: d.id,
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      species: d.species,
      confidence,
      predictedDiseased,
      actualDiseased: d.diseased,
      fruitEstimate,
      actualFruit,
      distance: d.distance
    };
  });
}
