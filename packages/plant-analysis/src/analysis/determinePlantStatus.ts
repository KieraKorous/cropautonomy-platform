import type { AnalysisStatus } from "../types";
import type { EvaluatedRule } from "./types";

/**
 * Maps a health score + findings to a status (PRD §10.11, §10.10):
 *   ≥ 80 healthy · 60–79 attention · < 60 critical.
 * With no evaluable measurements the result is insufficient-data. A critical
 * finding never sits under a "healthy" banner — it forces at least "attention"
 * even when the numeric score is high (PRD §10.10: critical findings are not
 * hidden behind an average).
 */
export function determinePlantStatus(
  score: number,
  triggered: EvaluatedRule[],
  evaluableCount: number
): AnalysisStatus {
  if (evaluableCount === 0) return "insufficient-data";
  const hasCritical = triggered.some((t) => t.rule.severity === "critical");
  let status: AnalysisStatus = score >= 80 ? "healthy" : score >= 60 ? "attention" : "critical";
  if (hasCritical && status === "healthy") status = "attention";
  return status;
}
