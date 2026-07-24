import { useLiveQuery } from "dexie-react-hooks";
import type {
  AnalysisResultRecord,
  AnalysisRuleRecord,
  CropProfileRecord,
  FieldRecord,
  FindingRecord,
  GrowthStageRecord,
  ImageRecord,
  ObservationRecord,
  PlantRecord,
  SourceRecord
} from "../types";
import {
  getCropProfile,
  getField,
  getPlant,
  getRule,
  latestObservationForPlant,
  latestResultForPlant,
  listFields,
  listFindingsByResult,
  listGrowthStages,
  listImagesByPlant,
  listObservationsByPlant,
  listPlantsByField,
  listRecentResultsWithFindings,
  listResultsByPlant,
  listRulesByCrop,
  listSources
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

export function useLatestResult(
  plantId: string | undefined
): AnalysisResultRecord | undefined {
  return useLiveQuery(() => (plantId ? latestResultForPlant(plantId) : undefined), [plantId]);
}

export function useFindings(resultId: string | undefined): FindingRecord[] | undefined {
  return useLiveQuery(() => (resultId ? listFindingsByResult(resultId) : []), [resultId]);
}

export function useSources(cropId: string | undefined): SourceRecord[] | undefined {
  return useLiveQuery(() => (cropId ? listSources(cropId) : []), [cropId]);
}

export function useImagesByPlant(plantId: string | undefined): ImageRecord[] | undefined {
  return useLiveQuery(() => (plantId ? listImagesByPlant(plantId) : []), [plantId]);
}

/** All rules for a crop, INCLUDING disabled ones — for the admin editor. */
export function useAllRulesByCrop(cropId: string | undefined): AnalysisRuleRecord[] | undefined {
  return useLiveQuery(() => (cropId ? listRulesByCrop(cropId) : []), [cropId]);
}

export function useRule(id: string | undefined): AnalysisRuleRecord | undefined {
  return useLiveQuery(() => (id ? getRule(id) : undefined), [id]);
}

export function useResultsByPlant(
  plantId: string | undefined
): AnalysisResultRecord[] | undefined {
  return useLiveQuery(() => (plantId ? listResultsByPlant(plantId) : []), [plantId]);
}

export function useRecentAnalyses(
  plantId: string | undefined,
  limit = 5
): { result: AnalysisResultRecord; findings: FindingRecord[] }[] | undefined {
  return useLiveQuery(
    () => (plantId ? listRecentResultsWithFindings(plantId, limit) : []),
    [plantId, limit]
  );
}
