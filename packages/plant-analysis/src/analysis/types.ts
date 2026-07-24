import type { AnalysisResultRecord, AnalysisRuleRecord, FindingRecord } from "../types";

/** A rule that fired, with the human-readable evidence for its finding. */
export interface EvaluatedRule {
  rule: AnalysisRuleRecord;
  observedValue?: string;
  expectedValue?: string;
}

/** Outcome of running a rule set against one observation. */
export interface RuleEvaluation {
  triggered: EvaluatedRule[];
  /** Rules that had enough data to evaluate (drives insufficient-data status). */
  evaluableCount: number;
}

/** What analyzePlant returns and persists. */
export interface AnalysisOutcome {
  result: AnalysisResultRecord;
  findings: FindingRecord[];
}
