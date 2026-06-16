"use client";

import { useEffect, useState, useTransition } from "react";
import type { CaptureDetailsPatch, ObservationType, Severity } from "../../../../lib/api";
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

// The capture's details — short brief + observation type + severity + an in-depth
// analysis — are filled automatically by the analysis pipeline. This editor
// pre-populates with those AI values and lets a reviewer correct them
// (suggest-then-confirm). Rendered order is Observation → Severity → Details, with
// the short Brief as the lead. Free-text fields save on their Save button;
// chips/severity save immediately on click.
export function CaptureDetailsEditor({
  captureId,
  initialSummary,
  initialDetails,
  initialObservationType,
  initialSeverity,
  analyzed
}: {
  captureId: string;
  initialSummary: string | null;
  initialDetails: string | null;
  initialObservationType: ObservationType | null;
  initialSeverity: Severity | null;
  analyzed: boolean;
}) {
  const [obsType, setObsType] = useState<ObservationType | null>(initialObservationType);
  const [severity, setSeverity] = useState<Severity | null>(initialSeverity);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Sync structured fields when a newly-analyzed value arrives.
  useEffect(() => setObsType(initialObservationType), [initialObservationType]);
  useEffect(() => setSeverity(initialSeverity), [initialSeverity]);

  const saveField = (patch: CaptureDetailsPatch, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await updateCaptureDetailsAction(captureId, patch);
        after?.();
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  const saveType = (next: ObservationType | null) => {
    setObsType(next);
    saveField({ observationType: next });
  };

  const saveSeverity = (next: Severity | null) => {
    setSeverity(next);
    saveField({ severity: next });
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

      {/* Brief — short one-line summary */}
      <EditableText
        id="capture-summary"
        label="Brief"
        initialValue={initialSummary}
        rows={2}
        maxLength={4000}
        pending={pending}
        placeholder={
          analyzed
            ? "No notable findings — add a brief if needed."
            : "Filled automatically once analysis completes. You can also write your own."
        }
        onSave={(value, done) => saveField({ summary: value }, done)}
      />

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

      {/* Details — in-depth analysis of what's healthy vs. what's wrong */}
      <EditableText
        id="capture-details"
        label="Details"
        initialValue={initialDetails}
        rows={6}
        maxLength={8000}
        pending={pending}
        placeholder={
          analyzed
            ? "No in-depth findings — add detail if needed."
            : "Filled automatically once analysis completes — an in-depth look at what's healthy and what needs attention."
        }
        onSave={(value, done) => saveField({ details: value }, done)}
      />

      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}

// A labelled textarea with a Save button (suggest-then-confirm). Owns its own
// draft state; adopts an incoming server value as the new baseline unless the
// user has unsaved edits. Used for both the short Brief and the in-depth Details.
function EditableText({
  id,
  label,
  initialValue,
  rows,
  maxLength,
  placeholder,
  pending,
  onSave
}: {
  id: string;
  label: string;
  initialValue: string | null;
  rows: number;
  maxLength: number;
  placeholder: string;
  pending: boolean;
  onSave: (value: string, onSaved: () => void) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");

  // Adopt a newly-analyzed value as the baseline unless the user has unsaved edits.
  useEffect(() => {
    if (value === saved) {
      setValue(initialValue ?? "");
      setSaved(initialValue ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialValue]);

  const dirty = value.trim() !== saved.trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs font-medium uppercase tracking-wide text-base-content/55"
        >
          {label}
        </label>
        {dirty ? <span className="text-xs text-base-content/45">Unsaved changes</span> : null}
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => onSave(value, () => setSaved(value))}
          disabled={!dirty || pending}
          className="inline-flex items-center justify-center rounded-lg bg-neutral px-4 py-2 text-sm font-semibold text-base-100 transition-colors hover:bg-neutral/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
