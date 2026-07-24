import { useEffect, useState } from "react";
import { getCropProfile, seedCrop } from "../database/index";
import { TOMATO_CROP_ID, TOMATO_PROFILE, tomatoSeed } from "../knowledge/crops/tomato/index";

// Seeds the bundled crop knowledge (currently tomato) into the local database.
// Idempotent — seedCrop puts by primary key. Re-seeds when the bundled profile
// version is newer than what's stored, so rule/threshold updates reach existing
// local databases without a manual clear. Historical results are unaffected: they
// snapshot the rule they used and never re-resolve live rules.
export async function ensureTomatoSeeded(): Promise<void> {
  const existing = await getCropProfile(TOMATO_CROP_ID);
  if (existing && existing.version >= TOMATO_PROFILE.version) return;
  await seedCrop(tomatoSeed());
}

/**
 * Ensures the crop knowledge base exists before the UI needs it (crop profile,
 * growth stages, rules). Returns true once seeding has completed. Client-only —
 * the effect never runs during SSR.
 */
export function useEnsureSeeded(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureTomatoSeeded()
      .then(() => alive && setReady(true))
      .catch(() => alive && setReady(true)); // don't block the UI on a seed hiccup
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}
