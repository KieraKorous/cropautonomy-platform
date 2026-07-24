import type { RuleOperator } from "@gaia/plant-analysis";

// Shared metadata for the rule editor + tester: the measurements a rule can
// target and the operators it can use. Measurement kinds drive which value input
// the form shows; operator "needs" drives value vs. range vs. no input.

export type MeasurementKind = "number" | "boolean" | "enum";

export interface MeasurementDef {
  key: string;
  label: string;
  kind: MeasurementKind;
  unit?: string;
  options?: string[];
}

export const MEASUREMENTS: MeasurementDef[] = [
  { key: "soilMoisturePercent", label: "Soil moisture", kind: "number", unit: "%" },
  { key: "temperatureC", label: "Temperature", kind: "number", unit: "°C" },
  { key: "humidityPercent", label: "Humidity", kind: "number", unit: "%" },
  { key: "heightCm", label: "Height", kind: "number", unit: "cm" },
  { key: "soilPh", label: "Soil pH", kind: "number" },
  { key: "leafCount", label: "Leaf count", kind: "number" },
  { key: "flowerCount", label: "Flower count", kind: "number" },
  { key: "fruitCount", label: "Fruit count", kind: "number" },
  {
    key: "leafColor",
    label: "Leaf color",
    kind: "enum",
    options: ["deep-green", "green", "pale", "yellow", "purple"]
  },
  { key: "wilting", label: "Wilting", kind: "boolean" },
  { key: "leafSpots", label: "Leaf spots", kind: "boolean" },
  { key: "holesInLeaves", label: "Holes in leaves", kind: "boolean" },
  { key: "curledLeaves", label: "Curled leaves", kind: "boolean" },
  { key: "browning", label: "Browning", kind: "boolean" },
  { key: "pestObserved", label: "Pest present", kind: "boolean" }
];

export function measurementDef(key: string): MeasurementDef | undefined {
  return MEASUREMENTS.find((m) => m.key === key);
}

export type OperatorNeed = "value" | "range" | "none";

export const OPERATORS: { value: RuleOperator; label: string; needs: OperatorNeed }[] = [
  { value: "lessThan", label: "less than", needs: "value" },
  { value: "lessThanOrEqual", label: "≤", needs: "value" },
  { value: "greaterThan", label: "greater than", needs: "value" },
  { value: "greaterThanOrEqual", label: "≥", needs: "value" },
  { value: "equals", label: "equals", needs: "value" },
  { value: "notEquals", label: "not equals", needs: "value" },
  { value: "between", label: "between", needs: "range" },
  { value: "outsideRange", label: "outside range", needs: "range" },
  { value: "isTrue", label: "is true", needs: "none" },
  { value: "isFalse", label: "is false", needs: "none" },
  { value: "isPresent", label: "is present", needs: "none" },
  { value: "isMissing", label: "is missing", needs: "none" }
];

export function operatorNeed(op: RuleOperator): OperatorNeed {
  return OPERATORS.find((o) => o.value === op)?.needs ?? "value";
}

export const inputClass =
  "rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50";
