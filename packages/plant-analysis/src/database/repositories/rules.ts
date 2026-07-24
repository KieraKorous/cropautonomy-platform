import type { AnalysisRuleRecord, GrowthStageKey } from "../../types";
import { newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

// Read paths for the engine + full CRUD for the admin knowledge editor.

/** Enabled rules matching a crop + a specific stage, via [cropId+stage]. */
export async function listRulesByCropAndStage(
  cropId: string,
  stage: GrowthStageKey
): Promise<AnalysisRuleRecord[]> {
  const rules = await getDb().rules.where("[cropId+stage]").equals([cropId, stage]).toArray();
  return rules.filter((r) => r.enabled);
}

/** All ENABLED rules for a crop (what the engine evaluates). */
export async function listEnabledRules(cropId: string): Promise<AnalysisRuleRecord[]> {
  const rules = await getDb().rules.where("cropId").equals(cropId).toArray();
  return rules.filter((r) => r.enabled);
}

/** ALL rules for a crop including disabled — for the admin editor. Sorted by name. */
export async function listRulesByCrop(cropId: string): Promise<AnalysisRuleRecord[]> {
  const rules = await getDb().rules.where("cropId").equals(cropId).toArray();
  return rules.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRule(id: string): Promise<AnalysisRuleRecord | undefined> {
  return getDb().rules.get(id);
}

export async function bulkPutRules(rules: AnalysisRuleRecord[]): Promise<void> {
  await getDb().rules.bulkPut(rules);
}

export type RuleDraft = Omit<
  AnalysisRuleRecord,
  "id" | "cropId" | "version" | "createdAt" | "updatedAt"
>;

/** Creates a new admin rule at version 1. */
export async function createRule(cropId: string, draft: RuleDraft): Promise<AnalysisRuleRecord> {
  const now = nowIso();
  const rule: AnalysisRuleRecord = {
    ...draft,
    id: newId("rule"),
    cropId,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
  await getDb().rules.put(rule);
  return rule;
}

/**
 * Edits a rule's definition and BUMPS its version (PRD §22 — "changes are
 * versioned"). Historical findings snapshot the version they used, so past
 * results are unaffected by the edit.
 */
export async function updateRule(id: string, draft: RuleDraft): Promise<AnalysisRuleRecord | null> {
  const db = getDb();
  const current = await db.rules.get(id);
  if (!current) return null;
  const next: AnalysisRuleRecord = {
    ...current,
    ...draft,
    cropId: current.cropId,
    version: current.version + 1,
    updatedAt: nowIso()
  };
  await db.rules.put(next);
  return next;
}

/** Toggles evaluation on/off. Not a definition change, so it does not bump the version. */
export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await getDb().rules.update(id, { enabled, updatedAt: nowIso() });
}

export async function deleteRule(id: string): Promise<void> {
  // Stored findings snapshot their rule, so deleting a rule never rewrites history.
  await getDb().rules.delete(id);
}
