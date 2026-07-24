import { defineConfig } from "vitest/config";

// First test runner in the repo — scoped to this package (run via
// `pnpm --filter @gaia/plant-analysis test`). The setup file registers an
// in-memory IndexedDB so the Dexie repositories + analyzePlant run headless in
// Node. fake-indexeddb resets per process, so these tests validate logic and
// indexes, not cross-refresh persistence (that's the portal dev route's job).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"]
  }
});
