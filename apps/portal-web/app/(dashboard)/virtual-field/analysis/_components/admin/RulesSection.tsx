"use client";

import { useState } from "react";
import { useAllRulesByCrop, useGrowthStages, useSources } from "@gaia/plant-analysis/react";
import { deleteRule, setRuleEnabled } from "@gaia/plant-analysis/database";
import type { AnalysisRuleRecord } from "@gaia/plant-analysis";
import { OPERATORS } from "./fields";
import { RuleForm } from "./RuleForm";
import { RuleTester } from "./RuleTester";

function summarize(rule: AnalysisRuleRecord): string {
  const op = OPERATORS.find((o) => o.value === rule.operator)?.label ?? rule.operator;
  const need = OPERATORS.find((o) => o.value === rule.operator)?.needs;
  if (need === "range") return `${rule.measurement} ${op} ${rule.minimum}–${rule.maximum}`;
  if (need === "none") return `${rule.measurement} ${op}`;
  return `${rule.measurement} ${op} ${rule.value}`;
}

export function RulesSection({ cropId }: { cropId: string }) {
  const rules = useAllRulesByCrop(cropId);
  const sources = useSources(cropId);
  const stages = useGrowthStages(cropId);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-neutral">Rules</h2>
          {rules ? <span className="text-xs text-base-content/50">{rules.length}</span> : null}
        </div>
        {!creating ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90"
          >
            New rule
          </button>
        ) : null}
      </div>

      {creating ? (
        <RuleForm cropId={cropId} sources={sources ?? []} stages={stages ?? []} onDone={() => setCreating(false)} />
      ) : null}

      {rules === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-base-content/60">No rules yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-base-content/8">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-col gap-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${rule.enabled ? "text-neutral" : "text-base-content/40"}`}>
                      {rule.name}
                    </span>
                    <span className="text-[11px] text-base-content/40">v{rule.version}</span>
                    {rule.provisional ? (
                      <span className="rounded-full bg-base-content/5 px-2 py-0.5 text-[11px] text-base-content/55">Provisional</span>
                    ) : null}
                  </div>
                  <span className="text-xs text-base-content/50">
                    {summarize(rule)} · {rule.severity} · −{rule.scorePenalty}
                    {rule.stage ? ` · ${rule.stage}` : ""}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 text-base-content/60">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => void setRuleEnabled(rule.id, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Enabled
                  </label>
                  <Btn onClick={() => setTestingId(testingId === rule.id ? null : rule.id)}>Test</Btn>
                  <Btn
                    onClick={() => {
                      setEditingId(editingId === rule.id ? null : rule.id);
                      setCreating(false);
                    }}
                  >
                    {editingId === rule.id ? "Close" : "Edit"}
                  </Btn>
                  <Btn onClick={() => void deleteRule(rule.id)}>Delete</Btn>
                </div>
              </div>

              {testingId === rule.id ? <RuleTester rule={rule} /> : null}
              {editingId === rule.id ? (
                <RuleForm
                  cropId={cropId}
                  rule={rule}
                  sources={sources ?? []}
                  stages={stages ?? []}
                  onDone={() => setEditingId(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-base-content/15 px-2.5 py-1 font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
    >
      {children}
    </button>
  );
}
