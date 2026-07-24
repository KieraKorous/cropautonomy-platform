import type { AnalysisResultRecord, FindingRecord } from "../../types";
import { getDb } from "../db";

// Written by the analysis engine (analyzePlant). Findings carry a full snapshot
// of the rule that produced them, so a stored result stays reproducible even if
// the rule is later edited or disabled (PRD §22).

/** Persists a result and its findings atomically. */
export async function saveResult(
  result: AnalysisResultRecord,
  findings: FindingRecord[]
): Promise<AnalysisResultRecord> {
  const db = getDb();
  await db.transaction("rw", [db.results, db.findings], async () => {
    await db.results.put(result);
    if (findings.length > 0) await db.findings.bulkPut(findings);
  });
  return result;
}

export async function getResult(id: string): Promise<AnalysisResultRecord | undefined> {
  return getDb().results.get(id);
}

/** Newest result first, via [plantId+analyzedAt]. */
export async function listResultsByPlant(plantId: string): Promise<AnalysisResultRecord[]> {
  return getDb()
    .results.where("[plantId+analyzedAt]")
    .between([plantId, ""], [plantId, "￿"])
    .reverse()
    .toArray();
}

export async function latestResultForPlant(
  plantId: string
): Promise<AnalysisResultRecord | undefined> {
  return getDb()
    .results.where("[plantId+analyzedAt]")
    .between([plantId, ""], [plantId, "￿"])
    .last();
}

/** The most recent results (newest first) paired with their findings, for trend/repeat detection. */
export async function listRecentResultsWithFindings(
  plantId: string,
  limit = 5
): Promise<{ result: AnalysisResultRecord; findings: FindingRecord[] }[]> {
  const results = (await listResultsByPlant(plantId)).slice(0, limit);
  const db = getDb();
  return Promise.all(
    results.map(async (result) => ({
      result,
      findings: await db.findings.where("analysisResultId").equals(result.id).toArray()
    }))
  );
}
