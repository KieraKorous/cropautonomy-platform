"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ObservationType, Severity } from "../../../../lib/api";
import { updateCaptureAnnotationAction } from "../actions";

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

// Editable annotation for a capture: a free-form note plus structured
// observation type + severity. The note saves on demand (Save button); the
// chips/severity save immediately on click through the server action.
export function CaptureDescriptionEditor({
  captureId,
  initial,
  initialObservationType,
  initialSeverity
}: {
  captureId: string;
  initial: string | null;
  initialObservationType: ObservationType | null;
  initialSeverity: Severity | null;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [obsType, setObsType] = useState<ObservationType | null>(
    initialObservationType
  );
  const [severity, setSeverity] = useState<Severity | null>(initialSeverity);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (value === saved) {
      setValue(initial ?? "");
      setSaved(initial ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initial]);

  const dirty = value.trim() !== saved.trim();

  const saveNote = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateCaptureAnnotationAction(captureId, { description: value });
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
        await updateCaptureAnnotationAction(captureId, { observationType: next });
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
        await updateCaptureAnnotationAction(captureId, { severity: next });
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
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

      {/* Note */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="capture-description"
            className="text-xs font-medium uppercase tracking-wide text-base-content/55"
          >
            Note
          </label>
          {dirty ? (
            <span className="text-xs text-base-content/45">Unsaved changes</span>
          ) : null}
        </div>
        <textarea
          id="capture-description"
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="Add observation notes — symptoms, location details, follow-up actions…"
          className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-error">{error}</span>
          <button
            type="button"
            onClick={saveNote}
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
