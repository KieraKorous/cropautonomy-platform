import { notFound } from "next/navigation";
import { SmokeClient } from "./SmokeClient";

// TEMPORARY dev-only harness for @gaia/plant-analysis Milestone 1 verification
// (PRD Phases 1–3). Proves a field → plant → observation can be saved, read back,
// and survive a hard refresh against real browser IndexedDB. Remove (or leave
// gated) before the feature ships — it is blocked in production below.
export const dynamic = "force-dynamic";

export default function PlantDbSmokePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">Plant Analysis DB — smoke test</h1>
      <p className="mt-1 text-sm text-base-content/60">
        Dev-only. Seed → Read → hard-refresh → Read again to confirm IndexedDB persistence.
      </p>
      <SmokeClient />
    </div>
  );
}
