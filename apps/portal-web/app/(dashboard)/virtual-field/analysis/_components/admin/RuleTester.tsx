"use client";

import { useState } from "react";
import { evaluateRule, expectedText, observedText } from "@gaia/plant-analysis/analysis";
import type { AnalysisRuleRecord, ObservationRecord } from "@gaia/plant-analysis";
import { inputClass, measurementDef } from "./fields";

// Rule test interface (PRD §12): enter a sample value for the rule's measurement
// and see whether the rule applies and fires, with the evidence it would show.

export function RuleTester({ rule }: { rule: AnalysisRuleRecord }) {
  const mDef = measurementDef(rule.measurement);
  const [value, setValue] = useState("");
  const [bool, setBool] = useState(false);

  function sampleValue(): string | number | boolean | undefined {
    if (mDef?.kind === "boolean") return bool;
    if (value.trim() === "") return undefined; // tests "missing"
    if (mDef?.kind === "number") {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    return value;
  }

  const raw = sampleValue();
  const observation = {
    id: "test",
    plantId: "",
    fieldId: "",
    recordedAt: new Date().toISOString(),
    source: "manual",
    createdAt: "",
    updatedAt: "",
    [rule.measurement]: raw
  } as unknown as ObservationRecord;

  const { applicable, triggered } = evaluateRule(rule, observation);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base-content/10 bg-base-200/40 p-4">
      <span className="text-xs font-medium text-base-content/70">
        Test — sample {mDef?.label ?? rule.measurement}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {mDef?.kind === "boolean" ? (
          <label className="flex items-center gap-2 text-sm text-neutral">
            <input type="checkbox" checked={bool} onChange={(e) => setBool(e.target.checked)} className="h-4 w-4 accent-primary" />
            {rule.measurement}
          </label>
        ) : mDef?.kind === "enum" ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
            <option value="">— (missing)</option>
            {mDef.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value (blank = missing)"
            className={inputClass}
          />
        )}

        <span className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${triggered ? "bg-warning" : applicable ? "bg-success" : "bg-base-content/30"}`} aria-hidden />
          <span className="font-medium text-neutral">
            {triggered ? "Would trigger" : applicable ? "Would not trigger" : "Not applicable (no data)"}
          </span>
        </span>
      </div>
      {triggered ? (
        <p className="text-xs text-base-content/60">
          Observed <span className="font-medium text-neutral">{observedText(rule, raw) ?? "—"}</span> · expected{" "}
          <span className="font-medium text-neutral">{expectedText(rule) ?? "—"}</span> · −{rule.scorePenalty} pts
        </p>
      ) : null}
    </div>
  );
}
