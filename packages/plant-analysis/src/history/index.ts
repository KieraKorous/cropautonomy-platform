// Plant history & trend calculations (PRD §10.14). Pure and SSR-safe — no
// database dependency. Import from "@gaia/plant-analysis/history".

export type { SeriesPoint, Delta, RepeatedCondition } from "./trends";
export {
  measurementSeries,
  growthRatePerDay,
  growthRatePerWeek,
  latestDelta,
  healthScoreDelta,
  daysSinceLastObservation,
  detectRepeatedConditions
} from "./trends";
