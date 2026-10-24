import { DEFAULT_RULES, parseRules } from "./rules";

describe("parseRules", () => {
  it("returns defaults for non-object input", () => {
    expect(parseRules(undefined)).toEqual(DEFAULT_RULES);
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    expect(parseRules("x")).toEqual(DEFAULT_RULES);
    expect(parseRules([])).toEqual(DEFAULT_RULES);
  });

  it("keeps valid values and drops unknown keys", () => {
    const parsed = parseRules({
      fairness: "fifo",
      maxPendingPerUser: 3,
      maxPendingPerTable: 5,
      cooldownMinutesPerUser: 15,
      requireHostApproval: true,
      allowDuets: false,
      maxSingersPerSong: 2,
      hostPriorityEnabled: false,
      duplicateSongWindowMinutes: 0,
      nightCutoffMinutesBeforeClose: 20,
      somethingElse: "ignored",
    });
    expect(parsed).toEqual({
      fairness: "fifo",
      maxPendingPerUser: 3,
      maxPendingPerTable: 5,
      cooldownMinutesPerUser: 15,
      requireHostApproval: true,
      allowDuets: false,
      maxSingersPerSong: 2,
      hostPriorityEnabled: false,
      duplicateSongWindowMinutes: 0,
      nightCutoffMinutesBeforeClose: 20,
    });
  });

  it("falls back per field on invalid values", () => {
    const parsed = parseRules({
      fairness: "random",
      maxPendingPerUser: -1,
      maxPendingPerTable: "many",
      cooldownMinutesPerUser: 1.5,
      requireHostApproval: "yes",
    });
    expect(parsed.fairness).toBe(DEFAULT_RULES.fairness);
    expect(parsed.maxPendingPerUser).toBe(DEFAULT_RULES.maxPendingPerUser);
    expect(parsed.maxPendingPerTable).toBe(DEFAULT_RULES.maxPendingPerTable);
    expect(parsed.cooldownMinutesPerUser).toBe(DEFAULT_RULES.cooldownMinutesPerUser);
    expect(parsed.requireHostApproval).toBe(DEFAULT_RULES.requireHostApproval);
  });

  it("never allows maxPendingPerUser below 1", () => {
    expect(parseRules({ maxPendingPerUser: 0 }).maxPendingPerUser).toBe(1);
  });

  it("accepts explicit null for nullable limits", () => {
    expect(parseRules({ maxPendingPerTable: null }).maxPendingPerTable).toBeNull();
    expect(
      parseRules({ nightCutoffMinutesBeforeClose: null }).nightCutoffMinutesBeforeClose,
    ).toBeNull();
  });
});
