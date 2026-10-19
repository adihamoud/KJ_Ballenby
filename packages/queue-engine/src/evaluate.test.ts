import { evaluateRequest } from "./evaluate";
import { DEFAULT_RULES } from "./rules";
import { at, entry, night, resetFixtures } from "./fixtures";
import type { NewRequest, QueueRulesConfig } from "./types";

const rules: QueueRulesConfig = { ...DEFAULT_RULES };

function request(overrides: Partial<NewRequest> = {}): NewRequest {
  return {
    songId: "song-new",
    userId: "u-new",
    tableId: "t1",
    groupId: null,
    singers: ["u-new"],
    songActive: true,
    ...overrides,
  };
}

beforeEach(() => resetFixtures());

describe("evaluateRequest", () => {
  it("accepts a plain request into an empty open night", () => {
    const res = evaluateRequest(rules, night(), request());
    expect(res).toEqual({ ok: true, status: "queued", position: 1000 });
  });

  it("appends after the current tail", () => {
    const state = night({
      queue: [entry({ userId: "a", position: 1000 }), entry({ userId: "b", position: 2000 })],
    });
    const res = evaluateRequest(rules, state, request());
    expect(res.ok && res.position).toBe(3000);
  });

  it("marks the request pending when host approval is required", () => {
    const res = evaluateRequest({ ...rules, requireHostApproval: true }, night(), request());
    expect(res.ok && res.status).toBe("pending");
  });

  it("rejects when the night is closed", () => {
    const res = evaluateRequest(rules, night({ nightStatus: "closed" }), request());
    expect(res).toEqual({ ok: false, reason: "NIGHT_CLOSED" });
  });

  it("rejects inside the cutoff window before close", () => {
    const state = night({ now: at(60), closesAt: at(75) });
    const res = evaluateRequest({ ...rules, nightCutoffMinutesBeforeClose: 20 }, state, request());
    expect(res).toEqual({ ok: false, reason: "CUTOFF" });
  });

  it("allows requests before the cutoff window", () => {
    const state = night({ now: at(60), closesAt: at(90) });
    const res = evaluateRequest({ ...rules, nightCutoffMinutesBeforeClose: 20 }, state, request());
    expect(res.ok).toBe(true);
  });

  it("ignores cutoff when the night has no close time", () => {
    const res = evaluateRequest(
      { ...rules, nightCutoffMinutesBeforeClose: 20 },
      night(),
      request(),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects inactive songs", () => {
    const res = evaluateRequest(rules, night(), request({ songActive: false }));
    expect(res).toEqual({ ok: false, reason: "SONG_INACTIVE" });
  });

  it("rejects duets when disabled", () => {
    const res = evaluateRequest(
      { ...rules, allowDuets: false },
      night(),
      request({ singers: ["a", "b"] }),
    );
    expect(res).toEqual({ ok: false, reason: "DUETS_DISABLED" });
  });

  it("rejects too many singers", () => {
    const res = evaluateRequest(
      { ...rules, maxSingersPerSong: 2 },
      night(),
      request({ singers: ["a", "b", "c"] }),
    );
    expect(res).toEqual({ ok: false, reason: "TOO_MANY_SINGERS" });
  });

  it("treats an empty singers list as one singer", () => {
    const res = evaluateRequest({ ...rules, allowDuets: false }, night(), request({ singers: [] }));
    expect(res.ok).toBe(true);
  });

  it("enforces max pending per user across queue and pending approvals", () => {
    const queued = night({ queue: [entry({ userId: "u-new" })] });
    expect(evaluateRequest(rules, queued, request())).toEqual({
      ok: false,
      reason: "MAX_PENDING_USER",
    });

    const pending = night({ pendingRequests: [{ userId: "u-new", tableId: "t1", songId: "x" }] });
    expect(evaluateRequest(rules, pending, request())).toEqual({
      ok: false,
      reason: "MAX_PENDING_USER",
    });

    expect(evaluateRequest({ ...rules, maxPendingPerUser: 2 }, queued, request()).ok).toBe(true);
  });

  it("enforces max pending per table when configured", () => {
    const state = night({
      queue: [entry({ userId: "a", tableId: "t1" }), entry({ userId: "b", tableId: "t1" })],
    });
    expect(evaluateRequest({ ...rules, maxPendingPerTable: 2 }, state, request())).toEqual({
      ok: false,
      reason: "MAX_PENDING_TABLE",
    });
    expect(evaluateRequest({ ...rules, maxPendingPerTable: 3 }, state, request()).ok).toBe(true);
    expect(
      evaluateRequest({ ...rules, maxPendingPerTable: 2 }, state, request({ tableId: null })).ok,
    ).toBe(true);
  });

  it("applies the per-user cooldown with a retry hint", () => {
    const state = night({
      now: at(60),
      history: [{ songId: "s", userId: "u-new", tableId: "t1", endedAt: at(50) }],
    });
    const res = evaluateRequest({ ...rules, cooldownMinutesPerUser: 15 }, state, request());
    expect(res).toEqual({ ok: false, reason: "COOLDOWN", retryAfterMs: 5 * 60_000 });
  });

  it("lets the user back in once the cooldown has passed", () => {
    const state = night({
      now: at(60),
      history: [{ songId: "s", userId: "u-new", tableId: "t1", endedAt: at(40) }],
    });
    expect(evaluateRequest({ ...rules, cooldownMinutesPerUser: 15 }, state, request()).ok).toBe(
      true,
    );
  });

  it("rejects a song that is already in the queue", () => {
    const state = night({ queue: [entry({ userId: "a", songId: "song-new" })] });
    expect(evaluateRequest(rules, state, request())).toEqual({
      ok: false,
      reason: "DUPLICATE_SONG",
    });
  });

  it("rejects a song sung recently, with a retry hint", () => {
    const state = night({
      now: at(60),
      history: [{ songId: "song-new", userId: "a", tableId: null, endedAt: at(30) }],
    });
    expect(evaluateRequest(rules, state, request())).toEqual({
      ok: false,
      reason: "DUPLICATE_SONG",
      retryAfterMs: 30 * 60_000,
    });
  });

  it("allows the song again after the duplicate window", () => {
    const state = night({
      now: at(120),
      history: [{ songId: "song-new", userId: "a", tableId: null, endedAt: at(30) }],
    });
    expect(evaluateRequest(rules, state, request()).ok).toBe(true);
  });

  it("disables the duplicate check when the window is 0", () => {
    const state = night({ queue: [entry({ userId: "a", songId: "song-new" })] });
    expect(evaluateRequest({ ...rules, duplicateSongWindowMinutes: 0 }, state, request()).ok).toBe(
      true,
    );
  });
});
