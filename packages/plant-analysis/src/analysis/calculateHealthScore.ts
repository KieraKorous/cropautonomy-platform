import type { EvaluatedRule } from "./types";

/**
 * Health score 0–100 (PRD §10.10): start at 100 and subtract each triggered
 * rule's penalty. Clamped so it never leaves [0, 100]. The score is a rollup —
 * critical findings are surfaced separately and never averaged away (see
 * determinePlantStatus).
 */
export function calculateHealthScore(triggered: EvaluatedRule[]): number {
  const penalty = triggered.reduce((sum, t) => sum + (t.rule.scorePenalty || 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
