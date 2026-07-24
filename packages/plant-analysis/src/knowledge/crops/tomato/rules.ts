import type { AnalysisRuleRecord, GrowthStageKey, RuleOperator, Severity } from "../../../types";
import { SEED_TIMESTAMP, TOMATO_CROP_ID } from "./profile";
import { SOURCE_BLIGHT_ID, SOURCE_EXTENSION_TEMP, SOURCE_UC_IPM } from "./sources";

// The 12 initial tomato rules (TOMATO-SCOPE.md §3). Responsible-language messages
// (PRD §10.9) — "possible", "outside expected range", "needs inspection" — never
// definitive diagnosis. `provisional: true` marks sensible defaults pending
// source review so the UI can badge them.

interface RuleSpec {
  id: string;
  name: string;
  measurement: string;
  operator: RuleOperator;
  value?: number | string | boolean;
  minimum?: number;
  maximum?: number;
  stage?: GrowthStageKey;
  severity: Severity;
  scorePenalty: number;
  condition: string;
  message: string;
  recommendation?: string;
  sourceId?: string;
  provisional?: boolean;
}

const SPECS: RuleSpec[] = [
  {
    id: "tomato-low-moisture",
    name: "Low soil moisture",
    measurement: "soilMoisturePercent",
    operator: "lessThan",
    value: 45,
    severity: "warning",
    scorePenalty: 15,
    condition: "Possible underwatering",
    message: "Soil moisture is below the expected range for tomato.",
    recommendation: "Inspect the soil below the surface and verify recent watering.",
    sourceId: SOURCE_UC_IPM
  },
  {
    id: "tomato-high-moisture",
    name: "High soil moisture",
    measurement: "soilMoisturePercent",
    operator: "greaterThan",
    value: 85,
    severity: "warning",
    scorePenalty: 10,
    condition: "Possible overwatering",
    message: "Soil moisture is above the expected range; waterlogging can stress roots.",
    recommendation: "Check drainage and hold off watering until the soil dries.",
    provisional: true
  },
  {
    id: "tomato-low-temp",
    name: "Low temperature",
    measurement: "temperatureC",
    operator: "lessThan",
    value: 10,
    severity: "warning",
    scorePenalty: 12,
    condition: "Cold stress condition",
    message: "Temperature is below the range tomatoes tolerate well.",
    recommendation: "Protect from cold; note that growth may slow below 10 °C.",
    sourceId: SOURCE_EXTENSION_TEMP
  },
  {
    id: "tomato-high-temp",
    name: "High temperature",
    measurement: "temperatureC",
    operator: "greaterThan",
    value: 32,
    stage: "flowering",
    severity: "warning",
    scorePenalty: 15,
    condition: "Heat stress condition",
    message: "Temperature is above the range for reliable pollination during flowering.",
    recommendation: "Provide shade/airflow where possible; watch for blossom drop.",
    sourceId: SOURCE_EXTENSION_TEMP
  },
  {
    id: "tomato-high-temp-fruiting",
    name: "High temperature (fruiting)",
    measurement: "temperatureC",
    operator: "greaterThan",
    value: 32,
    stage: "fruiting",
    severity: "warning",
    scorePenalty: 15,
    condition: "Heat stress condition",
    message: "Temperature is above the preferred range during fruiting.",
    recommendation: "Provide shade/airflow where possible; monitor fruit set.",
    sourceId: SOURCE_EXTENSION_TEMP
  },
  {
    id: "tomato-low-humidity",
    name: "Low humidity",
    measurement: "humidityPercent",
    operator: "lessThan",
    value: 40,
    severity: "info",
    scorePenalty: 5,
    condition: "Low humidity noted",
    message: "Humidity is on the low side; additional information may be required.",
    provisional: true
  },
  {
    id: "tomato-high-humidity",
    name: "High humidity",
    measurement: "humidityPercent",
    operator: "greaterThan",
    value: 85,
    severity: "warning",
    scorePenalty: 10,
    condition: "Elevated disease-pressure condition",
    message: "Humidity is high, which can raise foliar disease pressure.",
    recommendation: "Improve airflow and inspect foliage for early lesions.",
    provisional: true
  },
  {
    id: "tomato-yellowing",
    name: "Yellowing leaves",
    measurement: "yellowing",
    operator: "isTrue",
    severity: "warning",
    scorePenalty: 15,
    condition: "Yellowing observed",
    message: "Yellowing leaves were recorded and need inspection.",
    recommendation: "Inspect lower vs. upper leaves; possible nutrient or watering cause.",
    sourceId: SOURCE_UC_IPM
  },
  {
    id: "tomato-browning",
    name: "Browning leaves",
    measurement: "browning",
    operator: "isTrue",
    severity: "warning",
    scorePenalty: 15,
    condition: "Browning observed",
    message: "Browning was recorded and needs inspection.",
    recommendation: "Check for scorch, disease, or dieback on affected foliage.",
    provisional: true
  },
  {
    id: "tomato-wilting",
    name: "Wilting",
    measurement: "wilting",
    operator: "isTrue",
    severity: "critical",
    scorePenalty: 20,
    condition: "Wilting detected",
    message: "Wilting was recorded; this can indicate water or vascular stress.",
    recommendation: "Check soil moisture below the surface and inspect the stem base.",
    sourceId: SOURCE_UC_IPM
  },
  {
    id: "tomato-leaf-spots",
    name: "Leaf spots",
    measurement: "leafSpots",
    operator: "isTrue",
    severity: "warning",
    scorePenalty: 18,
    condition: "Leaf spots observed",
    message: "Leaf spots were recorded, which may indicate a foliar condition.",
    recommendation: "Compare against early/late blight identification guidance.",
    sourceId: SOURCE_BLIGHT_ID
  },
  {
    id: "tomato-leaf-holes",
    name: "Holes in leaves",
    measurement: "holesInLeaves",
    operator: "isTrue",
    severity: "warning",
    scorePenalty: 12,
    condition: "Leaf holes observed",
    message: "Holes in leaves were recorded, which may indicate chewing pests.",
    recommendation: "Scout for hornworm or other chewing pests on stems and undersides.",
    sourceId: SOURCE_UC_IPM
  },
  {
    id: "tomato-pest-present",
    name: "Pest present",
    measurement: "pestObserved",
    operator: "isTrue",
    severity: "warning",
    scorePenalty: 15,
    condition: "Pest presence recorded",
    message: "A pest was recorded during observation.",
    recommendation: "Identify the pest and follow IPM scouting thresholds before acting.",
    sourceId: SOURCE_UC_IPM
  }
];

export const TOMATO_RULES: AnalysisRuleRecord[] = SPECS.map((spec) => ({
  ...spec,
  cropId: TOMATO_CROP_ID,
  enabled: true,
  version: 1,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}));
