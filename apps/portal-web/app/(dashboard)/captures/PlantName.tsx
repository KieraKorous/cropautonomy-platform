"use client";

import { usePlantNameMode } from "../../../lib/plantNameMode";

// Renders a capture's plant name honoring the user's scientific-vs-common
// preference. `scientific` is captures.plantType (inferred_species); `common` is
// captures.commonName (inferred_common_name) — either may be null.
//
//   variant="primary"  → just the preferred name (list cards, table rows, titles)
//   variant="inline"   → "Preferred · other name" on one line (detail rows)
//   variant="stacked"  → preferred name with the other name beneath it (headers)
//
// When the scientific name is absent (not yet identified) it falls back to
// `fallback` — pass the status label so in-flight states still read correctly.
export function PlantName({
  scientific,
  common,
  fallback,
  variant = "primary"
}: {
  scientific: string | null;
  common: string | null;
  fallback?: string;
  variant?: "primary" | "inline" | "stacked";
}) {
  const mode = usePlantNameMode();

  if (!scientific) return <>{fallback ?? "Unidentified"}</>;

  const useCommon = mode === "common" && !!common;
  const primary = useCommon ? (common as string) : scientific;
  const secondary = useCommon ? scientific : common;

  if (variant === "primary" || !secondary) return <>{primary}</>;

  if (variant === "stacked") {
    return (
      <>
        <span className="block">{primary}</span>
        <span className="mt-1 block text-base font-normal italic text-base-content/55">
          {secondary}
        </span>
      </>
    );
  }

  // inline
  return (
    <>
      {primary}
      <span className="text-base-content/55"> · {secondary}</span>
    </>
  );
}
