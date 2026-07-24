// Root barrel for @gaia/plant-analysis.
//
// Exposes the SSR-safe surface: data types and pure utilities. The browser-only
// Dexie layer is deliberately NOT re-exported here — import it from the
// "@gaia/plant-analysis/database" subpath (behind dynamic(ssr:false) in the
// portal) so a stray server-component import of a type never drags the database
// into a server bundle. Crop knowledge lives at "@gaia/plant-analysis/knowledge/tomato".

export * from "./types";
export * from "./utilities/index";
