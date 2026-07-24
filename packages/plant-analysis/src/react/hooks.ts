import { useLiveQuery } from "dexie-react-hooks";
import type {
  CropProfileRecord,
  FieldRecord,
  GrowthStageRecord,
  ObservationRecord,
  PlantRecord
} from "../types";
import {
  getCropProfile,
  getField,
  getPlant,
  latestObservationForPlant,
  listFields,
  listGrowthStages,
  listObservationsByPlant,
  listPlantsByField
} from "../database/index";

// Reactive read hooks over the local Dexie database. Each returns `undefined`
// while the first query is in flight (treat as loading), then a live value that
// re-renders whenever the underlying tables change. The querier only runs on the
// client (inside useLiveQuery's effect), so these are SSR-safe: getDb() is never
// touched during server render.

export function useFields(): FieldRecord[] | undefined {
  return useLiveQuery(() => listFields());
}

export function useField(id: string | undefined): FieldRecord | undefined {
  return useLiveQuery(() => (id ? getField(id) : undefined), [id]);
}

export function usePlantsByField(fieldId: string | undefined): PlantRecord[] | undefined {
  return useLiveQuery(() => (fieldId ? listPlantsByField(fieldId) : []), [fieldId]);
}

export function usePlant(id: string | undefined): PlantRecord | undefined {
  return useLiveQuery(() => (id ? getPlant(id) : undefined), [id]);
}

export function useObservationsByPlant(
  plantId: string | undefined
): ObservationRecord[] | undefined {
  return useLiveQuery(() => (plantId ? listObservationsByPlant(plantId) : []), [plantId]);
}

export function useLatestObservation(
  plantId: string | undefined
): ObservationRecord | undefined {
  return useLiveQuery(() => (plantId ? latestObservationForPlant(plantId) : undefined), [plantId]);
}

export function useCropProfile(cropId: string | undefined): CropProfileRecord | undefined {
  return useLiveQuery(() => (cropId ? getCropProfile(cropId) : undefined), [cropId]);
}

export function useGrowthStages(cropId: string | undefined): GrowthStageRecord[] | undefined {
  return useLiveQuery(() => (cropId ? listGrowthStages(cropId) : []), [cropId]);
}
