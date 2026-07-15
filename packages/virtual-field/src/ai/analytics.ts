import type { Prediction } from "./inference";

// Accumulates the AI layer's per-plant predictions into field-level analytics as
// the rover scans. Each plant is counted once (deduped by id). Because the sim
// holds ground truth, we can score the model's real precision/recall alongside
// the operational numbers (disease rate, estimated yield). Kept as a module
// singleton — a running scan session — reset via resetAnalytics().

export interface AiStats {
  scanned: number;
  predictedDiseased: number;
  actualDiseased: number;
  truePos: number;
  falsePos: number;
  falseNeg: number;
  fruitingScanned: number;
  estFruit: number;
  actualFruit: number;
}

export function blankStats(): AiStats {
  return {
    scanned: 0,
    predictedDiseased: 0,
    actualDiseased: 0,
    truePos: 0,
    falsePos: 0,
    falseNeg: 0,
    fruitingScanned: 0,
    estFruit: 0,
    actualFruit: 0
  };
}

const seen = new Set<string>();
let stats = blankStats();

export function resetAnalytics() {
  seen.clear();
  stats = blankStats();
}

/** Fold newly-seen predictions into the running totals; returns a fresh snapshot. */
export function observeAi(preds: Prediction[]): AiStats {
  for (const p of preds) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);

    stats.scanned += 1;
    if (p.predictedDiseased) stats.predictedDiseased += 1;
    if (p.actualDiseased) stats.actualDiseased += 1;

    if (p.predictedDiseased && p.actualDiseased) stats.truePos += 1;
    else if (p.predictedDiseased && !p.actualDiseased) stats.falsePos += 1;
    else if (!p.predictedDiseased && p.actualDiseased) stats.falseNeg += 1;

    if (p.actualFruit > 0 || p.fruitEstimate > 0) {
      stats.fruitingScanned += 1;
      stats.estFruit += p.fruitEstimate;
      stats.actualFruit += p.actualFruit;
    }
  }
  return { ...stats };
}
