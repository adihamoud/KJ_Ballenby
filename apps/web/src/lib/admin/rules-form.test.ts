import { DEFAULT_RULES } from "@kj/queue-engine";
import { normalizeVenueName, rulesFromForm, rulesToFormValues } from "./rules-form";

const valid = {
  fairness: "round_robin_table",
  maxPendingPerUser: "1",
  maxPendingPerTable: "",
  cooldownMinutesPerUser: "0",
  requireHostApproval: null,
  allowDuets: "on",
  maxSingersPerSong: "4",
  hostPriorityEnabled: "on",
  duplicateSongWindowMinutes: "60",
  nightCutoffMinutesBeforeClose: "",
};

describe("rulesFromForm", () => {
  it("round-trips the default rules through form values", () => {
    const result = rulesFromForm(rulesToFormValues(DEFAULT_RULES));
    expect(result).toEqual({ ok: true, rules: DEFAULT_RULES });
  });

  it("parses a complete valid submission", () => {
    const result = rulesFromForm({ ...valid, maxPendingPerTable: "3", requireHostApproval: "on" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.maxPendingPerTable).toBe(3);
    expect(result.rules.requireHostApproval).toBe(true);
    expect(result.rules.allowDuets).toBe(true);
  });

  it("treats an absent checkbox as false", () => {
    const result = rulesFromForm({ ...valid, allowDuets: null, hostPriorityEnabled: null });
    expect(result).toMatchObject({
      ok: true,
      rules: { allowDuets: false, hostPriorityEnabled: false },
    });
  });

  it("reports fields the engine would have silently defaulted", () => {
    const result = rulesFromForm({
      ...valid,
      fairness: "random",
      maxPendingPerUser: "0",
      maxSingersPerSong: "0",
      cooldownMinutesPerUser: "-5",
      duplicateSongWindowMinutes: "1.5",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([...result.invalid].sort()).toEqual(
      [
        "cooldownMinutesPerUser",
        "duplicateSongWindowMinutes",
        "fairness",
        "maxPendingPerUser",
        "maxSingersPerSong",
      ].sort(),
    );
  });

  it("requires a value for non-nullable numbers and accepts empty for nullable ones", () => {
    const missing = rulesFromForm({ ...valid, cooldownMinutesPerUser: "" });
    expect(missing).toEqual({ ok: false, invalid: ["cooldownMinutesPerUser"] });
    const nullable = rulesFromForm({ ...valid, nightCutoffMinutesBeforeClose: "  " });
    expect(nullable).toMatchObject({ ok: true, rules: { nightCutoffMinutesBeforeClose: null } });
  });

  it("rejects non-numeric text", () => {
    const result = rulesFromForm({ ...valid, maxPendingPerTable: "many" });
    expect(result).toEqual({ ok: false, invalid: ["maxPendingPerTable"] });
  });

  it("reads FormData the same way as plain values", () => {
    const fd = new FormData();
    for (const [key, value] of Object.entries(valid)) if (value !== null) fd.set(key, value);
    expect(rulesFromForm(fd)).toEqual({ ok: true, rules: DEFAULT_RULES });
  });
});

describe("normalizeVenueName", () => {
  it("trims and bounds the name", () => {
    expect(normalizeVenueName("  Demo   Bar ")).toBe("Demo Bar");
    expect(normalizeVenueName("")).toBeNull();
    expect(normalizeVenueName("x".repeat(81))).toBeNull();
  });
});
