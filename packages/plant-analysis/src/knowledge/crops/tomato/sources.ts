import type { SourceRecord } from "../../../types";
import { TOMATO_CROP_ID } from "./profile";

// Provisional source stubs. Titles/URLs to be verified during the Phase 15 source
// review; rules that cite these carry provisional=false but the sources
// themselves still need a reviewedAt stamp before controlled use.

export const SOURCE_UC_IPM = "source_tomato_uc_ipm";
export const SOURCE_EXTENSION_TEMP = "source_tomato_extension_temp";
export const SOURCE_BLIGHT_ID = "source_tomato_blight_id";

export const TOMATO_SOURCES: SourceRecord[] = [
  {
    id: SOURCE_UC_IPM,
    cropId: TOMATO_CROP_ID,
    title: "UC IPM — Tomato irrigation & pest management guidelines",
    organization: "University of California Agriculture & Natural Resources",
    notes: "Provisional citation — verify exact page/threshold during source review."
  },
  {
    id: SOURCE_EXTENSION_TEMP,
    cropId: TOMATO_CROP_ID,
    title: "Cooperative Extension — Tomato temperature tolerance ranges",
    notes: "Provisional citation — pollen viability drops above ~32 °C; cold stress below ~10 °C."
  },
  {
    id: SOURCE_BLIGHT_ID,
    cropId: TOMATO_CROP_ID,
    title: "Tomato early & late blight identification guide",
    notes: "Provisional citation — foliar lesion identification."
  }
];
