import { describe, expect, it } from "vitest";
import { getDb } from "../database/db";
import { getCropProfile } from "../database/repositories/cropProfiles";
import { listEnabledRules } from "../database/repositories/rules";
import { TOMATO_CROP_ID, TOMATO_RULES } from "../knowledge/crops/tomato/index";
import { ensureTomatoSeeded } from "./seed";

describe("ensureTomatoSeeded", () => {
  it("seeds the current tomato knowledge on a fresh database", async () => {
    await ensureTomatoSeeded();
    const profile = await getCropProfile(TOMATO_CROP_ID);
    expect(profile?.version).toBe(2);
    expect(await listEnabledRules(TOMATO_CROP_ID)).toHaveLength(TOMATO_RULES.length);
  });

  it("re-seeds when the stored profile is an older version", async () => {
    await ensureTomatoSeeded();
    // Simulate a database seeded by an earlier build: downgrade the stored
    // version and delete a rule.
    await getDb().cropProfiles.update(TOMATO_CROP_ID, { version: 1 });
    await getDb().rules.delete(TOMATO_RULES[0].id);
    expect(await listEnabledRules(TOMATO_CROP_ID)).toHaveLength(TOMATO_RULES.length - 1);

    await ensureTomatoSeeded();
    expect((await getCropProfile(TOMATO_CROP_ID))?.version).toBe(2);
    expect(await listEnabledRules(TOMATO_CROP_ID)).toHaveLength(TOMATO_RULES.length);
  });

  it("does not re-seed when the stored version is current", async () => {
    await ensureTomatoSeeded();
    // Mark a rule disabled; a no-op ensure must NOT resurrect it.
    await getDb().rules.update(TOMATO_RULES[0].id, { enabled: false });
    await ensureTomatoSeeded();
    expect(await listEnabledRules(TOMATO_CROP_ID)).toHaveLength(TOMATO_RULES.length - 1);
  });
});
