"use client";

import { useState, useTransition } from "react";
import type {
  Annotation,
  AnnotationInput,
  ConfirmationLevel,
  Finding,
  FindingType,
  Severity
} from "../../../../lib/api";
import { createAnnotationAction } from "../actions";

const DOMAIN_LABEL: Record<FindingType, string> = {
  plant: "Plant",
  disease: "Disease",
  pest: "Pest",
  weed: "Weed",
  nutrient: "Nutrient",
  irrigation: "Water",
  soil: "Soil",
  damage: "Damage",
  growth_stage: "Growth",
  other: "Other"
};

// Issue domains offered when correcting/adding (species 'plant' lives in the
// header/metadata, not the findings panel).
const ISSUE_DOMAINS: FindingType[] = [
  "disease",
  "pest",
  "weed",
  "nutrient",
  "irrigation",
  "soil",
  "damage",
  "growth_stage",
  "other"
];
const SEVERITIES: Severity[] = ["low", "medium", "high"];
const CONFIRMATION_LEVELS: { value: ConfirmationLevel; label: string }[] = [
  { value: "field_visual", label: "Field visual" },
  { value: "expert_visual", label: "Expert visual" },
  { value: "lab_confirmed", label: "Lab confirmed" }
];

function humanize(value: string): string {
  const s = value.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function severityMarker(severity: Severity | null): string {
  switch (severity) {
    case "high":
      return "bg-error text-error-content";
    case "medium":
      return "bg-warning text-warning-content";
    case "low":
      return "bg-info text-info-content";
    default:
      return "bg-base-content/45 text-base-100";
  }
}

// State chip from the latest annotation on a finding.
function stateChip(source: Annotation["source"]): { label: string; cls: string } | null {
  switch (source) {
    case "human_confirmed_seed":
      return { label: "Confirmed", cls: "bg-success/15 text-success" };
    case "human_rejected_seed":
      return { label: "Rejected", cls: "bg-error/15 text-error" };
    case "human_corrected_seed":
      return { label: "Corrected", cls: "bg-info/15 text-info" };
    default:
      return null;
  }
}

// The detail page's findings panel + confirm loop. Each model finding gets a
// confirm / reject / correct control; reviewers can also add a finding the model
// missed. Every action appends a capture_annotations row (the labeled corpus).
// `findings` is the already-issue-filtered list, so the leading number stays in
// sync with the image overlay.
export function CaptureFindings({
  captureId,
  findings,
  annotations,
  analyzed,
  canAnnotate
}: {
  captureId: string;
  findings: Finding[];
  annotations: Annotation[];
  analyzed: boolean;
  canAnnotate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const submit = (input: AnnotationInput) => {
    setError(null);
    startTransition(async () => {
      try {
        await createAnnotationAction(captureId, input);
        setCorrectingId(null);
        setAdding(false);
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  // Latest annotation per model finding (annotations arrive oldest-first).
  const latestByResult = new Map<string, Annotation>();
  for (const a of annotations) {
    if (a.analysisResultId) latestByResult.set(a.analysisResultId, a);
  }
  // Reviewer-added findings (de novo, non-negative) — shown after model findings.
  const added = annotations.filter((a) => a.source === "human_de_novo" && !a.isNegative);

  const empty = findings.length === 0 && added.length === 0;

  return (
    <section className="rounded-xl border border-base-content/10 bg-base-100 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-base-content/55">
          Findings
        </h2>
        <div className="flex items-center gap-2">
          {findings.length > 0 ? (
            <span className="rounded-full bg-base-content/10 px-2 py-0.5 text-xs font-semibold text-base-content/60">
              {findings.length}
            </span>
          ) : null}
          {canAnnotate && !adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg bg-base-content/[0.06] px-2.5 py-1 text-xs font-semibold text-base-content/70 transition-colors hover:bg-base-content/[0.1]"
            >
              + Add
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-3 text-xs text-error">{error}</p> : null}

      {canAnnotate && adding ? (
        <div className="mb-4">
          <FindingEditor
            title="Add a finding"
            submitLabel="Add"
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(fields) =>
              submit({ source: "human_de_novo", ...fields })
            }
          />
        </div>
      ) : null}

      {empty ? (
        <p className="text-sm text-base-content/55">
          {analyzed
            ? "No issues detected in this capture."
            : "Analysis pending — findings appear once analysis completes."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((finding, i) => {
            const latest = latestByResult.get(finding.id);
            const chip = latest ? stateChip(latest.source) : null;
            const isCorrecting = correctingId === finding.id;
            return (
              <li key={finding.id} className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${severityMarker(
                      finding.severity
                    )}`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-neutral">
                        {humanize(finding.category)}
                      </span>
                      <span className="rounded-full bg-base-content/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                        {DOMAIN_LABEL[finding.findingType]}
                      </span>
                      {finding.severity ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/45">
                          {finding.severity}
                        </span>
                      ) : null}
                      {chip ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-base-content/55">
                      <span>{Math.round(finding.confidence * 100)}% confidence</span>
                      {finding.severityPct != null ? (
                        <span>~{Math.round(finding.severityPct)}% of tissue affected</span>
                      ) : null}
                    </div>
                    {finding.note ? (
                      <p className="text-sm leading-snug text-base-content/70">{finding.note}</p>
                    ) : null}

                    {canAnnotate && !isCorrecting ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ReviewButton
                          label="Confirm"
                          active={latest?.source === "human_confirmed_seed"}
                          activeCls="bg-success text-success-content"
                          disabled={pending}
                          onClick={() =>
                            submit({
                              source: "human_confirmed_seed",
                              analysisResultId: finding.id
                            })
                          }
                        />
                        <ReviewButton
                          label="Reject"
                          active={latest?.source === "human_rejected_seed"}
                          activeCls="bg-error text-error-content"
                          disabled={pending}
                          onClick={() =>
                            submit({
                              source: "human_rejected_seed",
                              analysisResultId: finding.id
                            })
                          }
                        />
                        <ReviewButton
                          label="Correct"
                          active={false}
                          activeCls=""
                          disabled={pending}
                          onClick={() => setCorrectingId(finding.id)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                {canAnnotate && isCorrecting ? (
                  <div className="pl-8">
                    <FindingEditor
                      title="Correct this finding"
                      submitLabel="Save correction"
                      pending={pending}
                      initial={{
                        category: finding.category,
                        findingType:
                          finding.findingType === "plant" ? "other" : finding.findingType,
                        severity: finding.severity
                      }}
                      onCancel={() => setCorrectingId(null)}
                      onSubmit={(fields) =>
                        submit({
                          source: "human_corrected_seed",
                          analysisResultId: finding.id,
                          ...fields
                        })
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })}

          {added.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/70 text-[11px] font-bold text-accent-content">
                +
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-neutral">
                    {humanize(a.category ?? "Finding")}
                  </span>
                  {a.findingType ? (
                    <span className="rounded-full bg-base-content/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                      {DOMAIN_LABEL[a.findingType]}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Added
                  </span>
                </div>
                {a.notes ? (
                  <p className="text-sm leading-snug text-base-content/70">{a.notes}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewButton({
  label,
  active,
  activeCls,
  disabled,
  onClick
}: {
  label: string;
  active: boolean;
  activeCls: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
        active
          ? activeCls
          : "bg-base-content/[0.06] text-base-content/70 hover:bg-base-content/[0.1]"
      }`}
    >
      {label}
    </button>
  );
}

// Shared form for correcting an existing finding or adding one de novo. Returns
// the label fields; the caller supplies source (+ analysisResultId for a
// correction).
function FindingEditor({
  title,
  submitLabel,
  pending,
  initial,
  onSubmit,
  onCancel
}: {
  title: string;
  submitLabel: string;
  pending: boolean;
  initial?: { category: string | null; findingType: FindingType; severity: Severity | null };
  onSubmit: (fields: {
    category: string;
    findingType: FindingType;
    severity: Severity | null;
    confirmationLevel: ConfirmationLevel;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? "");
  const [findingType, setFindingType] = useState<FindingType>(initial?.findingType ?? "disease");
  const [severity, setSeverity] = useState<Severity | null>(initial?.severity ?? null);
  const [level, setLevel] = useState<ConfirmationLevel>("field_visual");
  const [note, setNote] = useState("");

  const canSave = category.trim().length > 0 && !pending;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base-content/15 bg-base-200/40 p-3">
      <span className="text-xs font-semibold text-neutral">{title}</span>

      <input
        type="text"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Label, e.g. powdery_mildew"
        className="w-full rounded-md border border-base-content/15 bg-base-100 px-2.5 py-1.5 text-sm text-neutral outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      <div className="flex flex-wrap gap-1.5">
        {ISSUE_DOMAINS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFindingType(d)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              findingType === d
                ? "bg-neutral text-base-100"
                : "bg-base-content/[0.06] text-base-content/65 hover:bg-base-content/[0.1]"
            }`}
          >
            {DOMAIN_LABEL[d]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(severity === s ? null : s)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              severity === s
                ? "bg-neutral text-base-100"
                : "bg-base-content/[0.06] text-base-content/65 hover:bg-base-content/[0.1]"
            }`}
          >
            {humanize(s)}
          </button>
        ))}
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as ConfirmationLevel)}
          className="ml-auto rounded-md border border-base-content/15 bg-base-100 px-2 py-1 text-[11px] text-base-content/70 outline-none focus:border-accent"
        >
          {CONFIRMATION_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full rounded-md border border-base-content/15 bg-base-100 px-2.5 py-1.5 text-sm text-neutral outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-base-content/60 transition-colors hover:text-neutral disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSubmit({
              category: category.trim(),
              findingType,
              severity,
              confirmationLevel: level,
              notes: note.trim() || null
            })
          }
          className="rounded-md bg-neutral px-3 py-1.5 text-xs font-semibold text-base-100 transition-colors hover:bg-neutral/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
