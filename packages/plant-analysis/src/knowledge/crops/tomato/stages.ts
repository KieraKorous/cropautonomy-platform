import type { GrowthStageRecord } from "../../../types";
import { TOMATO_CROP_ID } from "./profile";

// See TOMATO-SCOPE.md §1 for the age ranges and the mapping to the Virtual
// Field's render enum.

export const TOMATO_STAGES: GrowthStageRecord[] = [
  { id: "stage_tomato_seedling", cropId: TOMATO_CROP_ID, key: "seedling", name: "Seedling", order: 1, minimumAgeDays: 0, maximumAgeDays: 21 },
  { id: "stage_tomato_vegetative", cropId: TOMATO_CROP_ID, key: "vegetative", name: "Vegetative", order: 2, minimumAgeDays: 21, maximumAgeDays: 45 },
  { id: "stage_tomato_flowering", cropId: TOMATO_CROP_ID, key: "flowering", name: "Flowering", order: 3, minimumAgeDays: 40, maximumAgeDays: 65 },
  { id: "stage_tomato_fruiting", cropId: TOMATO_CROP_ID, key: "fruiting", name: "Fruiting", order: 4, minimumAgeDays: 60, maximumAgeDays: 90 },
  { id: "stage_tomato_ripening", cropId: TOMATO_CROP_ID, key: "ripening", name: "Ripening", order: 5, minimumAgeDays: 85, maximumAgeDays: 120 },
  { id: "stage_tomato_harvest", cropId: TOMATO_CROP_ID, key: "harvest", name: "Harvest", order: 6, minimumAgeDays: 110 }
];
