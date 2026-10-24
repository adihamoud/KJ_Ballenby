import { DEMO_TABLES } from "@/lib/demo/venue";
import { DEMO_CATALOG } from "@/lib/guest/demo-catalog";
import { applyGuestRequest } from "@/lib/guest/queue-state";
import { demoSnapshot } from "./demo-night";
import {
  applyHostAction,
  closeNightSnapshot,
  nextUp,
  nowSinging,
  orderedQueue,
  pendingItems,
} from "./queue-model";
import type { DjSnapshot, HostAction } from "./types";

const NOW = new Date("2026-10-23T20:30:00.000Z");
const LATER = "2026-10-23T20:31:00.000Z";

function snapshot(): DjSnapshot {
  return demoSnapshot(NOW);
}

function apply(s: DjSnapshot, action: HostAction) {
  return applyHostAction(s, action, LATER);
}

const titles = (s: DjSnapshot) => orderedQueue(s).map((i) => i.title);

describe("demo night", () => {
  it("has one singer, a fair queue and pending approvals", () => {
    const s = snapshot();
    expect(nowSinging(s)?.title).toBe("Sweet Caroline");
    expect(pendingItems(s).map((i) => i.title)).toEqual(["Wonderwall", "דיווה"]);
    // Round robin by table: T2 just sang, so T1 and T3/Bar come first.
    expect(titles(s)[0]).toBe("Sweet Caroline");
    expect(titles(s)).toHaveLength(6);
  });
});

describe("approve", () => {
  it("creates a queue entry, queues the request and lets the engine place it", () => {
    const s = snapshot();
    const res = apply(s, {
      type: "approve",
      requestId: "demo-request-7",
      entryId: "new-entry-1",
    });
    const item = res.snapshot.items.find((i) => i.requestId === "demo-request-7");
    expect(item?.status).toBe("queued");
    expect(item?.entryId).toBe("new-entry-1");
    expect(res.requests).toEqual([{ requestId: "demo-request-7", status: "queued" }]);
    expect(res.inserts).toHaveLength(1);
    expect(res.inserts[0]?.position).toBe(item?.position);
    // The insert carries the final position; no separate position change for the new entry.
    expect(res.entries.find((e) => e.entryId === "new-entry-1")?.position).toBeUndefined();
    expect(pendingItems(res.snapshot)).toHaveLength(1);
  });

  it("ignores requests that are not pending", () => {
    const s = snapshot();
    const res = apply(s, { type: "approve", requestId: "demo-request-2", entryId: "new-entry-2" });
    expect(res.snapshot).toBe(s);
    expect(res.inserts).toEqual([]);
  });

  it("uses the client's entry id, so a follow-up action on that entry resolves", () => {
    const s = snapshot();
    const approved = apply(s, {
      type: "approve",
      requestId: "demo-request-7",
      entryId: "client-entry",
    });
    const started = apply(approved.snapshot, { type: "start", entryId: "client-entry" });
    expect(nowSinging(started.snapshot)?.title).toBe("Wonderwall");
  });

  it("ignores an approve whose entry id is already taken", () => {
    const s = snapshot();
    const res = apply(s, { type: "approve", requestId: "demo-request-7", entryId: "demo-entry-2" });
    expect(res.snapshot).toBe(s);
  });
});

describe("close night", () => {
  it("finishes the singer as done, skips the rest and closes the night", () => {
    const s = snapshot();
    const closed = closeNightSnapshot(s, LATER);
    expect(closed.night?.status).toBe("closed");
    expect(closed.items).toEqual([]);
    const sung = closed.history.find((h) => h.title === "Sweet Caroline");
    expect(sung?.endedAt).toBe(LATER);
    // Waiting songs were skipped, not sung: they never reach history.
    expect(closed.history).toHaveLength(s.history.length + 1);
  });
});

describe("start", () => {
  it("finishes the current singer and starts the chosen entry", () => {
    const s = snapshot();
    const res = apply(s, { type: "start", entryId: "demo-entry-2" });
    expect(nowSinging(res.snapshot)?.title).toBe("הללויה");
    expect(nowSinging(res.snapshot)?.startedAt).toBe(LATER);
    expect(res.snapshot.history.at(-1)?.title).toBe("Sweet Caroline");
    expect(res.requests).toEqual(
      expect.arrayContaining([
        { requestId: "demo-request-1", status: "done" },
        { requestId: "demo-request-2", status: "now_singing" },
      ]),
    );
    expect(res.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "demo-entry-1", endedAt: LATER }),
        expect.objectContaining({ entryId: "demo-entry-2", startedAt: LATER }),
      ]),
    );
  });
});

describe("done", () => {
  it("moves the singer to history and reorders", () => {
    const s = snapshot();
    const res = apply(s, { type: "done", entryId: "demo-entry-1", startNext: false });
    expect(nowSinging(res.snapshot)).toBeNull();
    expect(res.snapshot.history.map((h) => h.title)).toContain("Sweet Caroline");
    expect(res.snapshot.items.find((i) => i.entryId === "demo-entry-1")).toBeUndefined();
  });

  it("can auto-start the next fair entry", () => {
    const s = snapshot();
    const expectedNext = nextUp(s)?.title;
    const res = apply(s, { type: "done", entryId: "demo-entry-1", startNext: true });
    expect(nowSinging(res.snapshot)?.title).toBe(expectedNext);
  });
});

describe("skip", () => {
  it("drops a pending request without touching entries", () => {
    const s = snapshot();
    const res = apply(s, { type: "skip", requestId: "demo-request-8" });
    expect(res.requests).toEqual([{ requestId: "demo-request-8", status: "skipped" }]);
    expect(res.entries.filter((e) => e.endedAt)).toEqual([]);
    expect(res.snapshot.history).toHaveLength(s.history.length);
  });

  it("ends a queued entry and does not count it as sung", () => {
    const s = snapshot();
    const res = apply(s, { type: "skip", requestId: "demo-request-3" });
    expect(res.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "demo-entry-3", endedAt: LATER }),
      ]),
    );
    expect(res.snapshot.history).toHaveLength(s.history.length);
  });
});

describe("pin and priority", () => {
  it("locks an entry so reorder never moves it", () => {
    const s = snapshot();
    const res = apply(s, { type: "pin", entryId: "demo-entry-5", locked: true });
    const item = res.snapshot.items.find((i) => i.entryId === "demo-entry-5");
    expect(item?.lockedByHost).toBe(true);
    expect(res.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "demo-entry-5", lockedByHost: true }),
      ]),
    );
    const again = apply(res.snapshot, { type: "pin", entryId: "demo-entry-5", locked: true });
    expect(again.entries).toEqual([]);
  });

  it("raising priority moves the entry earlier within its lane", () => {
    const s = snapshot();
    const before = titles(s);
    // T1 has two queued songs: הללויה (older) and Dancing Queen. Prioritise the newer one.
    const res = apply(s, { type: "priority", requestId: "demo-request-5", priority: 2 });
    const after = titles(res.snapshot);
    expect(after.indexOf("Dancing Queen")).toBeLessThan(after.indexOf("הללויה"));
    expect(before.indexOf("Dancing Queen")).toBeGreaterThan(before.indexOf("הללויה"));
    expect(res.requests).toEqual([{ requestId: "demo-request-5", priority: 2 }]);
  });
});

describe("move", () => {
  it("moves an entry up one slot, locks it, and the order sticks", () => {
    const s = snapshot();
    const queued = orderedQueue(s).filter((i) => i.status === "queued");
    const third = queued[2];
    if (!third?.entryId) throw new Error("fixture");
    const res = apply(s, { type: "move", entryId: third.entryId, direction: "up" });
    const after = orderedQueue(res.snapshot).filter((i) => i.status === "queued");
    expect(after[1]?.entryId).toBe(third.entryId);
    expect(after[1]?.lockedByHost).toBe(true);
    // Applying the model again with no action is a no-op: the engine respects the lock.
    const again = apply(res.snapshot, { type: "pin", entryId: third.entryId, locked: true });
    expect(again.entries).toEqual([]);
  });

  it("does nothing at the edges", () => {
    const s = snapshot();
    const first = orderedQueue(s).filter((i) => i.status === "queued")[0];
    if (!first?.entryId) throw new Error("fixture");
    expect(apply(s, { type: "move", entryId: first.entryId, direction: "up" }).snapshot).toBe(s);
  });
});

describe("pin keeps the displayed slot", () => {
  function guestSong(title: string) {
    const song = DEMO_CATALOG.find((c) => c.title === title);
    if (!song) throw new Error(`fixture: ${title}`);
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      durationSec: song.duration_sec,
      videos: [],
      active: true,
    };
  }
  function who(tableIndex: number, userId: string) {
    const t = DEMO_TABLES[tableIndex];
    if (!t) throw new Error("fixture: table");
    return { userId, tableId: t.table_id, tableLabel: t.table_label, groupId: null };
  }

  it("renumbers stored positions to the fair order before locking", () => {
    const s = snapshot();
    // A guest request lands at the stored tail; for a table whose lane is short, round robin
    // shows it before the tail. Pick the first table where display and storage disagree.
    const storedIndex = (snap: DjSnapshot, entryId: string) =>
      [...snap.items]
        .filter((i) => i.entryId)
        .sort((a, b) => a.position - b.position)
        .findIndex((i) => i.entryId === entryId);
    let added: ReturnType<typeof applyGuestRequest> | null = null;
    let shown = -1;
    for (const tableIndex of [3, 2, 1, 0]) {
      const attempt = applyGuestRequest(
        s,
        guestSong("Don't Stop Believin'"),
        who(tableIndex, "guest-pin"),
        ["Pin"],
        null,
        LATER,
        { requestId: "r-pin", entryId: "e-pin" },
      );
      if (!attempt.ok) continue;
      const displayed = orderedQueue(attempt.snapshot).findIndex((i) => i.entryId === "e-pin");
      if (displayed !== storedIndex(attempt.snapshot, "e-pin")) {
        added = attempt;
        shown = displayed;
        break;
      }
    }
    if (!added || !added.ok) throw new Error("fixture: no table reorders the new request");

    const pinned = apply(added.snapshot, { type: "pin", entryId: "e-pin", locked: true });
    expect(orderedQueue(pinned.snapshot).findIndex((i) => i.entryId === "e-pin")).toBe(shown);

    // A later request from another table leaves the pinned song where the DJ saw it.
    const later = applyGuestRequest(
      pinned.snapshot,
      guestSong("I Will Survive"),
      who(2, "guest-2"),
      ["Two"],
      null,
      LATER,
      { requestId: "r-2", entryId: "e-2" },
    );
    if (!later.ok) throw new Error("fixture 2");
    expect(orderedQueue(later.snapshot).findIndex((i) => i.entryId === "e-pin")).toBe(shown);
  });
});

describe("reorder (drag and drop)", () => {
  const upNext = (s: DjSnapshot) => orderedQueue(s).filter((i) => i.status === "queued");
  const ids = (s: DjSnapshot) => upNext(s).map((i) => i.entryId);

  it("drops the last song at the top, locks it there and keeps the rest in order", () => {
    const s = snapshot();
    const before = ids(s);
    const last = before[before.length - 1]!;
    const res = apply(s, { type: "reorder", entryId: last, toIndex: 0 });
    expect(ids(res.snapshot)).toEqual([last, ...before.slice(0, -1)]);
    expect(upNext(res.snapshot)[0]?.lockedByHost).toBe(true);
    expect(res.entries.find((e) => e.entryId === last)?.lockedByHost).toBe(true);
  });

  it("drops the first song at the bottom", () => {
    const s = snapshot();
    const before = ids(s);
    const first = before[0]!;
    const res = apply(s, { type: "reorder", entryId: first, toIndex: before.length - 1 });
    expect(ids(res.snapshot)).toEqual([...before.slice(1), first]);
  });

  it("moves into the middle exactly like an array move", () => {
    const s = snapshot();
    const before = ids(s);
    const moved = before[0]!;
    const res = apply(s, { type: "reorder", entryId: moved, toIndex: 2 });
    const expected = before.filter((id) => id !== moved);
    expected.splice(2, 0, moved);
    expect(ids(res.snapshot)).toEqual(expected);
  });

  it("clamps targets past either end", () => {
    const s = snapshot();
    const before = ids(s);
    const second = before[1]!;
    const top = apply(s, { type: "reorder", entryId: second, toIndex: -5 });
    expect(ids(top.snapshot)[0]).toBe(second);
    const bottom = apply(s, { type: "reorder", entryId: second, toIndex: 99 });
    expect(ids(bottom.snapshot).at(-1)).toBe(second);
  });

  it("ignores a drop on the same place, a non-integer index and a pending request", () => {
    const s = snapshot();
    const first = ids(s)[0]!;
    expect(apply(s, { type: "reorder", entryId: first, toIndex: 0 }).snapshot).toBe(s);
    expect(apply(s, { type: "reorder", entryId: first, toIndex: 1.5 }).snapshot).toBe(s);
    expect(apply(s, { type: "reorder", entryId: "no-such-entry", toIndex: 0 }).snapshot).toBe(s);
  });

  it("keeps the dropped song in place when another table's request arrives", () => {
    const s = snapshot();
    const before = ids(s);
    const last = before[before.length - 1]!;
    const dropped = apply(s, { type: "reorder", entryId: last, toIndex: 1 });
    const song = DEMO_CATALOG.find((c) => c.title === "I Will Survive")!;
    const t3 = DEMO_TABLES[2]!;
    const later = applyGuestRequest(
      dropped.snapshot,
      {
        id: song.id,
        title: song.title,
        artist: song.artist,
        durationSec: song.duration_sec,
        videos: [],
        active: true,
      },
      { userId: "guest-late", tableId: t3.table_id, tableLabel: t3.table_label, groupId: null },
      ["Late"],
      null,
      LATER,
      { requestId: "r-late", entryId: "e-late" },
    );
    if (!later.ok) throw new Error("fixture");
    expect(ids(later.snapshot).indexOf(last)).toBe(1);
  });
});
