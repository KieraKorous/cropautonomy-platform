// Analysis engine for @gaia/plant-analysis. The pure functions (evaluateRule,
// evaluateRules, calculateHealthScore, determinePlantStatus, evidence) have no
// database dependency and are unit-tested directly. analyzePlant is the DB-bound
// orchestrator and, like the rest of the /database layer, is browser-only —
// import from "@gaia/plant-analysis/analysis" inside a client boundary.

export type { EvaluatedRule, RuleEvaluation, AnalysisOutcome } from "./types";
export { evaluateRule, readMeasurement, type MeasurementValue } from "./evaluateRule";
export { observedText, expectedText } from "./evidence";
export { evaluateRules, rulesForStage } from "./evaluateRules";
export { calculateHealthScore } from "./calculateHealthScore";
export { determinePlantStatus } from "./determinePlantStatus";
export { analyzePlant } from "./analyzePlant";
