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
// (suggest-then-confirm). All four fields are staged locally and committed
// together by a single Save button.
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
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [details, setDetails] = useState(initialDetails ?? "");
  const [obsType, setObsType] = useState<ObservationType | null>(initialObservationType);
  const [severity, setSeverity] = useState<Severity | null>(initialSeverity);

  const [savedSummary, setSavedSummary] = useState(initialSummary ?? "");
  const [savedDetails, setSavedDetails] = useState(initialDetails ?? "");
  const [savedObsType, setSavedObsType] = useState<ObservationType | null>(initialObservationType);
  const [savedSeverity, setSavedSeverity] = useState<Severity | null>(initialSeverity);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt a newly-analyzed value as the baseline unless the user has unsaved
  // edits to that field.
  useEffect(() => {
    if (summary === savedSummary) {
      setSummary(initialSummary ?? "");
      setSavedSummary(initialSummary ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialSummary]);
  useEffect(() => {
    if (details === savedDetails) {
      setDetails(initialDetails ?? "");
      setSavedDetails(initialDetails ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialDetails]);
  useEffect(() => {
    if (obsType === savedObsType) {
      setObsType(initialObservationType);
      setSavedObsType(initialObservationType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialObservationType]);
  useEffect(() => {
    if (severity === savedSeverity) {
      setSeverity(initialSeverity);
      setSavedSeverity(initialSeverity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initialSeverity]);

  const dirty =
    summary.trim() !== savedSummary.trim() ||
    details.trim() !== savedDetails.trim() ||
    obsType !== savedObsType ||
    severity !== savedSeverity;

  const saveAll = () => {
    setError(null);
    const patch: CaptureDetailsPatch = {};
    if (summary.trim() !== savedSummary.trim()) patch.summary = summary;
    if (details.trim() !== savedDetails.trim()) patch.details = details;
    if (obsType !== savedObsType) patch.observationType = obsType;
    if (severity !== savedSeverity) patch.severity = severity;
    startTransition(async () => {
      try {
        await updateCaptureDetailsAction(captureId, patch);
        setSavedSummary(summary);
        setSavedDetails(details);
        setSavedObsType(obsType);
        setSavedSeverity(severity);
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Brief — short one-line summary */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="capture-summary"
          className="text-xs font-medium uppercase tracking-wide text-base-content/55"
        >
          Brief
        </label>
        <textarea
          id="capture-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder={
            analyzed
              ? "No notable findings — add a brief if needed."
              : "Filled automatically once analysis completes. You can also write your own."
          }
          className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
        />
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
                onClick={() => setObsType(active ? null : opt.value)}
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
                onClick={() => setSeverity(active ? null : opt.value)}
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
      <div className="flex flex-col gap-2">
        <label
          htmlFor="capture-details"
          className="text-xs font-medium uppercase tracking-wide text-base-content/55"
        >
          Details
        </label>
        <textarea
          id="capture-details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={6}
          maxLength={8000}
          placeholder={
            analyzed
              ? "No in-depth findings — add detail if needed."
              : "Filled automatically once analysis completes — an in-depth look at what's healthy and what needs attention."
          }
          className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Single save for the whole panel */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-error">{error}</span>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-xs text-base-content/45">Unsaved changes</span> : null}
          <button
            type="button"
            onClick={saveAll}
            disabled={!dirty || pending}
            className="inline-flex items-center justify-center rounded-lg bg-neutral px-4 py-2 text-sm font-semibold text-base-100 transition-colors hover:bg-neutral/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
