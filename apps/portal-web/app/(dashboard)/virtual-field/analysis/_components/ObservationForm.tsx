"use client";

import { useState } from "react";
import { createObservation } from "@gaia/plant-analysis/database";
import { analyzePlant } from "@gaia/plant-analysis/analysis";
import type { ObservationRecord } from "@gaia/plant-analysis";

// Phase 5 observation entry. Groups measurements, validates ranges (PRD §10.6),
// saves the observation, then immediately runs the rule engine so a health result
// appears without a round-trip (Milestone 2 goal). Symptom checkboxes record an
// explicit true/false so "observed, absent" is distinct from "not recorded".

const LEAF_COLORS = ["deep-green", "green", "pale", "yellow", "purple"] as const;

const SYMPTOMS: { key: keyof ObservationRecord; label: string }[] = [
  { key: "wilting", label: "Wilting" },
  { key: "leafSpots", label: "Leaf spots" },
  { key: "holesInLeaves", label: "Holes in leaves" },
  { key: "curledLeaves", label: "Curled leaves" },
  { key: "browning", label: "Browning" },
  { key: "pestObserved", label: "Pest present" }
];

const inputClass =
  "rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50";

function localNowValue(): string {
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function ObservationForm({ plantId, fieldId }: { plantId: string; fieldId: string }) {
  const [recordedAt, setRecordedAt] = useState(localNowValue);
  const [leafColor, setLeafColor] = useState("");
  const [height, setHeight] = useState("");
  const [moisture, setMoisture] = useState("");
  const [temp, setTemp] = useState("");
  const [humidity, setHumidity] = useState("");
  const [symptoms, setSymptoms] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  function num(v: string): number | undefined {
    if (v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  function reset() {
    setRecordedAt(localNowValue());
    setLeafColor("");
    setHeight("");
    setMoisture("");
    setTemp("");
    setHumidity("");
    setSymptoms({});
    setNotes("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    // Hard validation (PRD §10.6): ranges that make a value impossible.
    const h = num(height);
    const m = num(moisture);
    const hum = num(humidity);
    if (h != null && h < 0) return setError("Height can't be negative.");
    if (m != null && (m < 0 || m > 100)) return setError("Soil moisture must be 0–100%.");
    if (hum != null && (hum < 0 || hum > 100)) return setError("Humidity must be 0–100%.");
    setError(null);
    setBusy(true);
    try {
      const observation = await createObservation({
        plantId,
        fieldId,
        recordedAt: recordedAt ? new Date(recordedAt).toISOString() : new Date().toISOString(),
        source: "manual",
        heightCm: h,
        soilMoisturePercent: m,
        temperatureC: num(temp),
        humidityPercent: hum,
        leafColor: leafColor || undefined,
        wilting: symptoms.wilting ?? false,
        leafSpots: symptoms.leafSpots ?? false,
        holesInLeaves: symptoms.holesInLeaves ?? false,
        curledLeaves: symptoms.curledLeaves ?? false,
        browning: symptoms.browning ?? false,
        pestObserved: symptoms.pestObserved ?? false,
        notes: notes.trim() || undefined
      });
      // Run the rule engine immediately; the result renders via live-query hooks.
      await analyzePlant(plantId, observation.id);
      reset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
      >
        Record observation
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-xl border border-base-content/10 bg-base-100 p-6"
    >
      <h2 className="text-base font-semibold text-neutral">Record observation</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date & time">
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Leaf color">
          <select
            value={leafColor}
            onChange={(e) => setLeafColor(e.target.value)}
            className={inputClass}
          >
            <option value="">— not recorded</option>
            {LEAF_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Height (cm)">
          <input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Soil moisture (%)">
          <input type="number" min={0} max={100} value={moisture} onChange={(e) => setMoisture(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Temperature (°C)">
          <input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Humidity (%)">
          <input type="number" min={0} max={100} value={humidity} onChange={(e) => setHumidity(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-base-content/70">Symptoms observed</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SYMPTOMS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm text-neutral">
              <input
                type="checkbox"
                checked={symptoms[s.key] ?? false}
                onChange={(e) => setSymptoms((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                className="h-4 w-4 rounded border-base-content/30 accent-primary"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </Field>

      {error ? <p className="text-xs text-error">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Saving & analyzing…" : "Save & analyze"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-base-content/70">{label}</span>
      {children}
    </label>
  );
}
