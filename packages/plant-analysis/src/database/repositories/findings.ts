import type { FindingRecord } from "../../types";
import { getDb } from "../db";

/** Findings for a result, critical-first (index [analysisResultId+severity]). */
export async function listFindingsByResult(resultId: string): Promise<FindingRecord[]> {
  const findings = await getDb()
    .findings.where("analysisResultId")
    .equals(resultId)
    .toArray();
  // severity order: critical > warning > info
  const rank: Record<FindingRecord["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
