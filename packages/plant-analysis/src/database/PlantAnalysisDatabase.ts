import Dexie, { type Table } from "dexie";
import type {
  FieldRecord,
  PlantRecord,
  ObservationRecord,
  CropProfileRecord,
  GrowthStageRecord,
  AnalysisRuleRecord,
  AnalysisResultRecord,
  FindingRecord,
  ImageRecord,
  SourceRecord
} from "../types";
import { DB_NAME, SCHEMA_V1 } from "./schema";

/**
 * Typed Dexie database for the local Plant Analysis system. Browser-only:
 * instantiating this touches `indexedDB`, so consumers in the Next.js portal must
 * load it behind `dynamic(() => import("@gaia/plant-analysis/database"),
 * { ssr: false })`. Never `new` this at module top level — see getDb() in db.ts.
 */
export class PlantAnalysisDatabase extends Dexie {
  fields!: Table<FieldRecord, string>;
  plants!: Table<PlantRecord, string>;
  observations!: Table<ObservationRecord, string>;
  cropProfiles!: Table<CropProfileRecord, string>;
  growthStages!: Table<GrowthStageRecord, string>;
  rules!: Table<AnalysisRuleRecord, string>;
  results!: Table<AnalysisResultRecord, string>;
  findings!: Table<FindingRecord, string>;
  images!: Table<ImageRecord, string>;
  sources!: Table<SourceRecord, string>;

  constructor() {
    super(DB_NAME);
    // v1. To evolve the schema, ADD `this.version(2).stores({...}).upgrade(...)`
    // below — never edit SCHEMA_V1 in place once data has shipped.
    this.version(1).stores(SCHEMA_V1);
  }
}
