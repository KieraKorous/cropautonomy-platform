"use client";

import { useEffect, useState, useTransition } from "react";
import type { ObservationType, Severity } from "../../../../lib/api";
import { updateCaptureDetailsAction } from "../actions";

const OBSERVATION_TYPES: { value: ObservationType; label: string }[] = [
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "weed", label: "Weed" },
  { value: "nutrient", label: "Nutrient" },
  { value: "irrigation", label: "Irrigation" },
  { value: "damage", label: "Damage" },
  { value: "growth_stage", label: "Growth stage" },
  { value: "other", label: "Other" }
];

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

// The capture's details — brief summary + observation type + severity — are
// filled automatically by the analysis pipeline. This editor pre-populates with
// those AI values and lets a reviewer correct them (suggest-then-confirm). The
// summary saves on the Save button; chips/severity save immediately on click.
export function CaptureDetailsEditor({
  captureId,
  initialSummary,
  initialObservationType,
  initialSeverity,
  analyzed
}: {
  captureId: string;
  initialSummary: string | null;
  initialObservationType: ObservationType | null;
  initialSeverity: Severity | null;
  analyzed: boolean;
}) {
  const [value, setValue] = useState(initialSummary ?? "");
  const [saved, setSaved] = useState(initialSummary ?? "");
  const [obsType, setObsType] = useState<ObservationType | null>(initialObservationType);
  const [severity, setSeverity] = useState<Severity | null>(initialSeverity);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt a newly-analyzed value as the baseline unless the user has unsaved edits.
  useEffect(() => {
    if (value === saved) {
      setValue(initialSummary ?? "");
      setSaved(initialSummary ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialSummary]);

  const dirty = value.trim() !== saved.trim();

  const saveSummary = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateCaptureDetailsAction(captureId, { summary: value });
        setSaved(value);
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  const saveType = (next: ObservationType | null) => {
    setObsType(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateCaptureDetailsAction(captureId, { observationType: next });
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  const saveSeverity = (next: Severity | null) => {
    setSeverity(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateCaptureDetailsAction(captureId, { severity: next });
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-base-content/55">
          Details
        </h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
          Auto-filled · editable
        </span>
      </div>

      {/* Brief summary */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="capture-summary"
            className="text-xs font-medium uppercase tracking-wide text-base-content/55"
          >
            Brief
          </label>
          {dirty ? (
            <span className="text-xs text-base-content/45">Unsaved changes</span>
          ) : null}
        </div>
        <textarea
          id="capture-summary"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={
            analyzed
              ? "No notable findings — add a note if needed."
              : "Filled automatically once analysis completes. You can also write your own."
          }
          className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-error">{error}</span>
          <button
            type="button"
            onClick={saveSummary}
            disabled={!dirty || pending}
            className="inline-flex items-center justify-center rounded-lg bg-neutral px-4 py-2 text-sm font-semibold text-base-100 transition-colors hover:bg-neutral/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Observation type */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-base-content/55">
          Observation
        </span>
        <div className="flex flex-wrap gap-1.5">
          {OBSERVATION_TYPES.map((opt) => {
            const active = obsType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={pending}
                onClick={() => saveType(active ? null : opt.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-neutral text-base-100"
                    : "bg-base-content/[0.06] text-base-content/65 hover:bg-base-content/[0.1]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Severity */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-base-content/55">
          Severity
        </span>
        <div className="flex gap-1.5">
          {SEVERITIES.map((opt) => {
            const active = severity === opt.value;
            const tone =
              opt.value === "high"
                ? "bg-error text-error-content"
                : opt.value === "medium"
                  ? "bg-warning text-warning-content"
                  : "bg-success text-success-content";
            return (
              <button
                key={opt.value}
                type="button"
                disabled={pending}
                onClick={() => saveSeverity(active ? null : opt.value)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  active ? tone : "bg-base-content/[0.06] text-base-content/65 hover:bg-base-content/[0.1]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
