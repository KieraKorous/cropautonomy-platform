// Database subpath entry: the Dexie class, the singleton accessor, and every
// repository free-function. Import from "@gaia/plant-analysis/database".
//
// Browser-only — see PlantAnalysisDatabase for the SSR/`dynamic(ssr:false)`
// contract.

export { PlantAnalysisDatabase } from "./PlantAnalysisDatabase";
export { getDb } from "./db";
export { DB_NAME, DB_VERSION, SCHEMA_V1 } from "./schema";

export * from "./repositories/fields";
export * from "./repositories/plants";
export * from "./repositories/observations";
export * from "./repositories/rules";
export * from "./repositories/cropProfiles";
export * from "./repositories/sources";
export * from "./repositories/results";
export * from "./repositories/findings";
export * from "./repositories/images";
export * from "./repositories/maintenance";
