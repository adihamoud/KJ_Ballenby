import { demoSnapshot } from "./demo-night";
import { applyHostAction, nextUp, nowSinging, orderedQueue, pendingItems } from "./queue-model";
import type { DjSnapshot, HostAction } from "./types";

const NOW = new Date("2026-10-23T20:30:00.000Z");
const LATER = "2026-10-23T20:31:00.000Z";
let seq = 0;
const newId = () => `new-entry-${++seq}`;

function snapshot(): DjSnapshot {
  seq = 0;
  return demoSnapshot(NOW);
}

function apply(s: DjSnapshot, action: HostAction) {
  return applyHostAction(s, action, LATER, newId);
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
    const res = apply(s, { type: "approve", requestId: "demo-request-7" });
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
    const res = apply(s, { type: "approve", requestId: "demo-request-2" });
    expect(res.snapshot).toBe(s);
    expect(res.inserts).toEqual([]);
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
