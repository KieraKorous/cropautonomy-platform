"use client";

import { setPlantNameMode, usePlantNameMode, type PlantNameMode } from "../../../lib/plantNameMode";

// Toggle for how plant names are shown across the captures list and detail
// views: scientific (e.g. "Citrus sinensis") or common (e.g. "Sweet orange").
// Persisted per-browser in localStorage via the shared plantNameMode store, so
// changing it here updates open captures views without a reload.
const OPTIONS: { value: PlantNameMode; label: string; example: string }[] = [
  { value: "scientific", label: "Scientific name", example: "Citrus sinensis" },
  { value: "common", label: "Common name", example: "Sweet orange" }
];

export function PlantNameSetting() {
  const mode = usePlantNameMode();

  return (
    <div
      className="inline-flex w-full max-w-md flex-col gap-2 sm:flex-row"
      role="group"
      aria-label="Plant name display"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => setPlantNameMode(opt.value)}
            className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
              active
                ? "border-accent bg-accent/[0.06]"
                : "border-base-content/15 bg-base-100 hover:border-base-content/30"
            }`}
          >
            <span className="text-sm font-semibold text-neutral">{opt.label}</span>
            <span className="text-xs italic text-base-content/55">{opt.example}</span>
          </button>
        );
      })}
    </div>
  );
}
