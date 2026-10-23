import { demoSnapshot } from "@/lib/dj/demo-night";
import { applyHostAction, toNightState } from "@/lib/dj/queue-model";
import type { DjSnapshot } from "@/lib/dj/types";
import { DEMO_CATALOG } from "./demo-catalog";
import {
  applyGuestRequest,
  cancelGuestRequest,
  evaluateGuestRequest,
  guestQueueView,
  sheetLimits,
} from "./queue-state";
import type { GuestRequestIdentity, GuestRequestSong } from "./queue-state";
import { DEMO_TABLES } from "@/lib/demo/venue";

const NOW = new Date("2026-10-23T20:30:00.000Z");
const LATER = "2026-10-23T20:31:00.000Z";
const T1 = DEMO_TABLES[0]!;
const T3 = DEMO_TABLES[2]!;

const dana: GuestRequestIdentity = {
  userId: "guest-dana",
  tableId: T1.table_id,
  tableLabel: T1.table_label,
  groupId: null,
};

function song(title: string, active = true): GuestRequestSong {
  const found = DEMO_CATALOG.find((s) => s.title === title);
  if (!found) throw new Error(`unknown demo song ${title}`);
  return {
    id: found.id,
    title: found.title,
    artist: found.artist,
    durationSec: found.duration_sec,
    videos: [],
    active,
  };
}

const ids = { requestId: "req-new", entryId: "entry-new" };

function request(
  snapshot: DjSnapshot,
  title: string,
  who = dana,
  singers = ["דנה"],
  now = LATER,
  active = true,
) {
  return applyGuestRequest(snapshot, song(title, active), who, singers, null, now, ids);
}

describe("evaluateGuestRequest maps the snapshot to the engine's NightState", () => {
  it("counts queued entries and pending requests, and done songs as history", () => {
    const state = toNightState(demoSnapshot(NOW), NOW.toISOString());
    expect(state.nightStatus).toBe("open");
    expect(state.queue).toHaveLength(6);
    expect(state.pendingRequests).toHaveLength(2);
    expect(state.history.map((h) => h.songId)).toHaveLength(2);
    // Entries carry the table so round robin can key on it.
    expect(state.queue.every((e) => e.tableId !== null)).toBe(true);
  });

  it("answers NIGHT_CLOSED when the snapshot has no open night", () => {
    const closed: DjSnapshot = { ...demoSnapshot(NOW), night: null, items: [] };
    const res = evaluateGuestRequest(closed, {
      songId: song("I Will Survive").id,
      songActive: true,
      userId: dana.userId,
      tableId: dana.tableId,
      groupId: null,
      singers: ["דנה"],
    });
    expect(res).toEqual({ ok: false, reason: "NIGHT_CLOSED" });
  });
});

describe("applyGuestRequest", () => {
  it("queues an accepted request at the engine's tail position", () => {
    const s = demoSnapshot(NOW);
    const res = request(s, "I Will Survive");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.status).toBe("queued");
    expect(res.item.entryId).toBe("entry-new");
    expect(res.item.requestedBy).toBe("guest-dana");
    expect(res.item.tableLabel).toBe("T1");
    const maxBefore = Math.max(...s.items.filter((i) => i.entryId).map((i) => i.position));
    expect(res.item.position).toBe(maxBefore + 1000);
    expect(res.snapshot.items).toHaveLength(s.items.length + 1);
    // The input snapshot is untouched.
    expect(s.items).toHaveLength(8);
  });

  it("leaves a request pending (no entry) when the venue requires approval", () => {
    const s = demoSnapshot(NOW);
    const approval: DjSnapshot = { ...s, rules: { ...s.rules, requireHostApproval: true } };
    const res = request(approval, "I Will Survive");
    expect(res.ok && res.item.status).toBe("pending");
    expect(res.ok && res.item.entryId).toBeNull();
  });

  it("rejects with each reason code the UI has to localize", () => {
    const s = demoSnapshot(NOW);
    // Second request from the same guest: maxPendingPerUser is 1.
    const first = request(s, "I Will Survive");
    if (!first.ok) throw new Error("setup");
    expect(request(first.snapshot, "Livin' on a Prayer")).toEqual({
      ok: false,
      reason: "MAX_PENDING_USER",
    });
    // Sweet Caroline is on the mic right now.
    expect(request(s, "Sweet Caroline")).toEqual({ ok: false, reason: "DUPLICATE_SONG" });
    // Bohemian Rhapsody finished 22 minutes ago, inside the 60-minute window.
    expect(request(s, "Bohemian Rhapsody")).toEqual({ ok: false, reason: "DUPLICATE_SONG" });
    expect(request(s, "I Will Survive", dana, ["a", "b", "c", "d", "e"])).toEqual({
      ok: false,
      reason: "TOO_MANY_SINGERS",
    });
    expect(request(s, "I Will Survive", dana, ["דנה"], LATER, false)).toEqual({
      ok: false,
      reason: "SONG_INACTIVE",
    });
    const noDuets: DjSnapshot = { ...s, rules: { ...s.rules, allowDuets: false } };
    expect(request(noDuets, "I Will Survive", dana, ["דנה", "יוסי"])).toEqual({
      ok: false,
      reason: "DUETS_DISABLED",
    });
    const perTable: DjSnapshot = { ...s, rules: { ...s.rules, maxPendingPerTable: 2 } };
    // T1 already has הללויה and Dancing Queen waiting.
    expect(request(perTable, "I Will Survive")).toEqual({
      ok: false,
      reason: "MAX_PENDING_TABLE",
    });
    const cooldown: DjSnapshot = { ...s, rules: { ...s.rules, cooldownMinutesPerUser: 30 } };
    const liorWhoJustSang = { ...dana, userId: "demo-history-user-2", tableId: T3.table_id };
    expect(request(cooldown, "I Will Survive", liorWhoJustSang)).toEqual({
      ok: false,
      reason: "COOLDOWN",
    });
    const cutoff: DjSnapshot = {
      ...s,
      night: { ...s.night!, closesAt: "2026-10-23T20:40:00.000Z" },
      rules: { ...s.rules, nightCutoffMinutesBeforeClose: 15 },
    };
    expect(request(cutoff, "I Will Survive")).toEqual({ ok: false, reason: "CUTOFF" });
    const closed: DjSnapshot = { ...s, night: { ...s.night!, status: "closed" } };
    expect(request(closed, "I Will Survive")).toEqual({ ok: false, reason: "NIGHT_CLOSED" });
  });
});

describe("guestQueueView", () => {
  it("shows the guest's own requests with their place among the waiting songs", () => {
    const s = demoSnapshot(NOW);
    const res = request(s, "I Will Survive");
    if (!res.ok) throw new Error("setup");
    const view = guestQueueView(res.snapshot, "guest-dana", LATER);

    expect(view.nightOpen).toBe(true);
    expect(view.nightId).toBe("demo-night");
    expect(view.nowSinging?.title).toBe("Sweet Caroline");
    expect(view.queueLength).toBe(7);
    expect(view.maxSingersPerSong).toBe(4);
    expect(view.mine).toHaveLength(1);
    const mine = view.mine[0]!;
    expect(mine.title).toBe("I Will Survive");
    expect(mine.status).toBe("queued");
    // T1 already has two songs waiting, so Dana's third T1 song lands last among six waiting.
    expect(mine.position).toBe(6);
    expect(mine.ahead).toBe(6);
  });

  it("hides other guests' requests and reports no position while pending", () => {
    const s = demoSnapshot(NOW);
    const approval: DjSnapshot = { ...s, rules: { ...s.rules, requireHostApproval: true } };
    const res = request(approval, "I Will Survive");
    if (!res.ok) throw new Error("setup");
    const view = guestQueueView(res.snapshot, "guest-dana", LATER);
    expect(view.mine.map((r) => r.title)).toEqual(["I Will Survive"]);
    expect(view.mine[0]?.position).toBeNull();
    expect(view.mine[0]?.ahead).toBeNull();
    expect(guestQueueView(res.snapshot, "someone-else", LATER).mine).toEqual([]);
  });

  it("moves the guest up when the DJ finishes a song", () => {
    const s = demoSnapshot(NOW);
    const res = request(s, "I Will Survive");
    if (!res.ok) throw new Error("setup");
    const before = guestQueueView(res.snapshot, "guest-dana", LATER).mine[0]!;
    const after = applyHostAction(
      res.snapshot,
      { type: "done", entryId: "demo-entry-1", startNext: true },
      LATER,
    );
    const view = guestQueueView(after.snapshot, "guest-dana", LATER);
    expect(view.mine[0]!.position).toBe(before.position! - 1);
    expect(view.nowSinging?.title).toBe("תודה");
  });

  it("is empty when the night is closed", () => {
    const closed: DjSnapshot = { ...demoSnapshot(NOW), night: null };
    const view = guestQueueView(closed, "guest-dana", LATER);
    expect(view.nightOpen).toBe(false);
    expect(view.nightId).toBeNull();
    expect(view.mine).toEqual([]);
    expect(view.queueLength).toBe(0);
  });
});

describe("cancelGuestRequest", () => {
  it("removes the guest's own waiting request and nothing else", () => {
    const s = demoSnapshot(NOW);
    const res = request(s, "I Will Survive");
    if (!res.ok) throw new Error("setup");
    const next = cancelGuestRequest(res.snapshot, "req-new", "guest-dana", LATER);
    expect(next?.items).toHaveLength(s.items.length);
    expect(guestQueueView(next!, "guest-dana", LATER).mine).toEqual([]);
    // Someone else's request, a stranger cancelling, or the singer on the mic: no change.
    expect(cancelGuestRequest(res.snapshot, "req-new", "guest-other", LATER)).toBeNull();
    expect(cancelGuestRequest(res.snapshot, "missing", "guest-dana", LATER)).toBeNull();
    expect(cancelGuestRequest(s, "demo-request-1", "demo-user-1", LATER)).toBeNull();
  });
});

describe("sheetLimits", () => {
  it("allows one singer when duets are off", () => {
    const rules = demoSnapshot(NOW).rules;
    expect(sheetLimits(rules)).toEqual({ maxSingers: 4, allowDuets: true });
    expect(sheetLimits({ ...rules, allowDuets: false })).toEqual({
      maxSingers: 1,
      allowDuets: false,
    });
  });
});
