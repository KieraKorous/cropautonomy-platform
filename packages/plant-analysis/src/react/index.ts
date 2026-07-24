// React bindings for @gaia/plant-analysis. Browser-only (wraps the Dexie layer
// via dexie-react-hooks). Import from "@gaia/plant-analysis/react"; in the Next.js
// portal these are used inside "use client" components.

export {
  useFields,
  useField,
  usePlantsByField,
  usePlant,
  useObservationsByPlant,
  useLatestObservation,
  useCropProfile,
  useGrowthStages
} from "./hooks";
export { ensureTomatoSeeded, useEnsureSeeded } from "./seed";
