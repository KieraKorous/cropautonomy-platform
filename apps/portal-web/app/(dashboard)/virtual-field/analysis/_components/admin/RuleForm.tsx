"use client";

import { useState } from "react";
import { createRule, updateRule, type RuleDraft } from "@gaia/plant-analysis/database";
import type {
  AnalysisRuleRecord,
  GrowthStageKey,
  GrowthStageRecord,
  RuleOperator,
  Severity,
  SourceRecord
} from "@gaia/plant-analysis";
import { MEASUREMENTS, OPERATORS, inputClass, measurementDef, operatorNeed } from "./fields";

interface FormState {
  name: string;
  measurement: string;
  operator: RuleOperator;
  value: string;
  minimum: string;
  maximum: string;
  stage: string; // "" = crop-wide
  severity: Severity;
  scorePenalty: string;
  condition: string;
  message: string;
  recommendation: string;
  sourceId: string;
  provisional: boolean;
  enabled: boolean;
}

function fromRule(rule?: AnalysisRuleRecord): FormState {
  return {
    name: rule?.name ?? "",
    measurement: rule?.measurement ?? MEASUREMENTS[0].key,
    operator: rule?.operator ?? "lessThan",
    value: rule?.value != null ? String(rule.value) : "",
    minimum: rule?.minimum != null ? String(rule.minimum) : "",
    maximum: rule?.maximum != null ? String(rule.maximum) : "",
    stage: rule?.stage ?? "",
    severity: rule?.severity ?? "warning",
    scorePenalty: rule?.scorePenalty != null ? String(rule.scorePenalty) : "10",
    condition: rule?.condition ?? "",
    message: rule?.message ?? "",
    recommendation: rule?.recommendation ?? "",
    sourceId: rule?.sourceId ?? "",
    provisional: rule?.provisional ?? false,
    enabled: rule?.enabled ?? true
  };
}

export function RuleForm({
  cropId,
  rule,
  sources,
  stages,
  onDone
}: {
  cropId: string;
  rule?: AnalysisRuleRecord;
  sources: SourceRecord[];
  stages: GrowthStageRecord[];
  onDone: () => void;
}) {
  const [f, setF] = useState<FormState>(() => fromRule(rule));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const mDef = measurementDef(f.measurement);
  const need = operatorNeed(f.operator);

  function buildDraft(): RuleDraft | string {
    if (!f.name.trim()) return "Give the rule a name.";
    if (!f.condition.trim()) return "Give the rule a condition label.";
    if (!f.message.trim()) return "Give the rule a message.";
    const penalty = Number(f.scorePenalty);
    if (!Number.isFinite(penalty) || penalty < 0) return "Score penalty must be 0 or more.";

    let value: RuleDraft["value"];
    let minimum: number | undefined;
    let maximum: number | undefined;
    if (need === "value") {
      if (mDef?.kind === "number") {
        const n = Number(f.value);
        if (!Number.isFinite(n)) return "Enter a numeric threshold.";
        value = n;
      } else {
        if (!f.value) return "Choose a value to compare against.";
        value = f.value;
      }
    } else if (need === "range") {
      minimum = Number(f.minimum);
      maximum = Number(f.maximum);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return "Enter both range bounds.";
    }

    return {
      name: f.name.trim(),
      measurement: f.measurement,
      operator: f.operator,
      value,
      minimum,
      maximum,
      stage: f.stage ? (f.stage as GrowthStageKey) : undefined,
      severity: f.severity,
      scorePenalty: penalty,
      condition: f.condition.trim(),
      message: f.message.trim(),
      recommendation: f.recommendation.trim() || undefined,
      sourceId: f.sourceId || undefined,
      provisional: f.provisional,
      enabled: f.enabled
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const draft = buildDraft();
    if (typeof draft === "string") return setError(draft);
    setError(null);
    setBusy(true);
    try {
      if (rule) await updateRule(rule.id, draft);
      else await createRule(cropId, draft);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-base-content/10 bg-base-200/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <L label="Name">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="Low soil moisture" />
        </L>
        <L label="Measurement">
          <select value={f.measurement} onChange={(e) => set("measurement", e.target.value)} className={inputClass}>
            {MEASUREMENTS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </L>
        <L label="Operator">
          <select value={f.operator} onChange={(e) => set("operator", e.target.value as RuleOperator)} className={inputClass}>
            {OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </L>

        {need === "value" ? (
          <L label={`Value${mDef?.unit ? ` (${mDef.unit})` : ""}`}>
            {mDef?.kind === "enum" ? (
              <select value={f.value} onChange={(e) => set("value", e.target.value)} className={inputClass}>
                <option value="">—</option>
                {mDef.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={mDef?.kind === "number" ? "number" : "text"}
                value={f.value}
                onChange={(e) => set("value", e.target.value)}
                className={inputClass}
              />
            )}
          </L>
        ) : null}
        {need === "range" ? (
          <>
            <L label="Minimum">
              <input type="number" value={f.minimum} onChange={(e) => set("minimum", e.target.value)} className={inputClass} />
            </L>
            <L label="Maximum">
              <input type="number" value={f.maximum} onChange={(e) => set("maximum", e.target.value)} className={inputClass} />
            </L>
          </>
        ) : null}

        <L label="Severity">
          <select value={f.severity} onChange={(e) => set("severity", e.target.value as Severity)} className={inputClass}>
            <option value="info">Information</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </L>
        <L label="Score penalty">
          <input type="number" min={0} value={f.scorePenalty} onChange={(e) => set("scorePenalty", e.target.value)} className={inputClass} />
        </L>
        <L label="Growth stage">
          <select value={f.stage} onChange={(e) => set("stage", e.target.value)} className={inputClass}>
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </L>
        <L label="Source">
          <select value={f.sourceId} onChange={(e) => set("sourceId", e.target.value)} className={inputClass}>
            <option value="">— none</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </L>
      </div>

      <L label="Condition (short label)">
        <input value={f.condition} onChange={(e) => set("condition", e.target.value)} className={inputClass} placeholder="Possible underwatering" />
      </L>
      <L label="Message">
        <textarea value={f.message} onChange={(e) => set("message", e.target.value)} rows={2} className={inputClass} />
      </L>
      <L label="Recommended next check">
        <textarea value={f.recommendation} onChange={(e) => set("recommendation", e.target.value)} rows={2} className={inputClass} />
      </L>

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm text-neutral">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-primary" />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral">
          <input type="checkbox" checked={f.provisional} onChange={(e) => set("provisional", e.target.checked)} className="h-4 w-4 accent-primary" />
          Provisional (unreviewed)
        </label>
      </div>

      {error ? <p className="text-xs text-error">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Saving…" : rule ? "Save changes" : "Create rule"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05]">
          Cancel
        </button>
        {rule ? <span className="text-xs text-base-content/45">Editing bumps to v{rule.version + 1}</span> : null}
      </div>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-base-content/70">{label}</span>
      {children}
    </label>
  );
}
