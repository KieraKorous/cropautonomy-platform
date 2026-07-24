import type { AnalysisResultRecord, FindingRecord } from "../../types";
import { getDb } from "../db";

// Written by the analysis engine (Phase 5/7). Reads are already usable for the
// plant history view (Phase 8/9).

export async function listResultsByPlant(plantId: string): Promise<AnalysisResultRecord[]> {
  // Newest first, via [plantId+analyzedAt].
  return getDb()
    .results.where("[plantId+analyzedAt]")
    .between([plantId, ""], [plantId, "￿"])
    .reverse()
    .toArray();
}

export async function getResult(id: string): Promise<AnalysisResultRecord | undefined> {
  return getDb().results.get(id);
}

/**
 * Phase 5: persists a result and its findings in one transaction. Findings carry
 * a full snapshot of the rule that produced them (see FindingRecord), so this
 * write is what makes historical results reproducible.
 */
export async function saveResult(
  _result: AnalysisResultRecord,
  _findings: FindingRecord[]
): Promise<AnalysisResultRecord> {
  throw new Error("saveResult is implemented in Phase 5 (analysis engine).");
}
