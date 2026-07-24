import { PlantAnalysisDatabase } from "./PlantAnalysisDatabase";

// Memoized singleton. Kept as a lazy function (never a top-level `new`) so that
// importing this module during Next.js SSR or in a Node test process does not
// touch `indexedDB` at import time — the DB is only constructed on first call,
// which only happens on the client / after a test sets up a fake indexedDB.

let db: PlantAnalysisDatabase | null = null;

export function getDb(): PlantAnalysisDatabase {
  if (!db) db = new PlantAnalysisDatabase();
  return db;
}
