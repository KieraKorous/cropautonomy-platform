import { describe, expect, it } from "vitest";
import {
  createRule,
  deleteRule,
  listEnabledRules,
  listRulesByCrop,
  setRuleEnabled,
  updateRule,
  type RuleDraft
} from "./repositories/rules";

const draft: RuleDraft = {
  name: "Custom low pH",
  measurement: "soilPh",
  operator: "lessThan",
  value: 5.5,
  severity: "warning",
  scorePenalty: 10,
  condition: "Acidic soil",
  message: "Soil pH is below the preferred range.",
  enabled: true
};

describe("rule CRUD (admin editor)", () => {
  it("creates a rule at version 1 and lists it (incl. disabled) for a crop", async () => {
    const created = await createRule("tomato", draft);
    expect(created.version).toBe(1);
    expect(created.cropId).toBe("tomato");
    expect(created.id.startsWith("rule_")).toBe(true);

    const all = await listRulesByCrop("tomato");
    expect(all.map((r) => r.id)).toContain(created.id);
  });

  it("bumps the version on edit (PRD §22 — changes are versioned)", async () => {
    const created = await createRule("tomato", draft);
    const edited = await updateRule(created.id, { ...draft, scorePenalty: 20 });
    expect(edited?.version).toBe(2);
    expect(edited?.scorePenalty).toBe(20);
  });

  it("disabled rules are excluded from the engine's enabled list but kept for admin", async () => {
    const created = await createRule("tomato", draft);
    await setRuleEnabled(created.id, false);

    const enabled = await listEnabledRules("tomato");
    expect(enabled.map((r) => r.id)).not.toContain(created.id);

    const all = await listRulesByCrop("tomato");
    expect(all.map((r) => r.id)).toContain(created.id); // still visible to admin
  });

  it("deletes a rule", async () => {
    const created = await createRule("tomato", draft);
    await deleteRule(created.id);
    const all = await listRulesByCrop("tomato");
    expect(all.map((r) => r.id)).not.toContain(created.id);
  });
});
