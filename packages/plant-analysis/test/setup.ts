// Registers a fresh in-memory indexedDB/IDBKeyRange on globalThis so Dexie works
// under Node. `fake-indexeddb/auto` wires the globals; resetDb() between tests
// gives each test a clean database.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";
import { resetDbForTests } from "../src/database/db";

afterEach(() => {
  // Drop the memoized Dexie instance, then swap in a fresh factory so the next
  // test opens a clean, empty database.
  resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});
