import { computeOrder, reorder } from "./order";
import { DEFAULT_RULES } from "./rules";
import { at, entry, night, resetFixtures } from "./fixtures";
import type { QueueRulesConfig } from "./types";

const rr: QueueRulesConfig = { ...DEFAULT_RULES, fairness: "round_robin_table" };
const fifo: QueueRulesConfig = { ...DEFAULT_RULES, fairness: "fifo" };

beforeEach(() => resetFixtures());

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);

describe("computeOrder / fifo", () => {
  it("orders by createdAt regardless of stored position", () => {
    const state = night({
      queue: [
        entry({ userId: "a", minute: 3, position: 1000 }),
        entry({ userId: "b", minute: 1, position: 2000 }),
        entry({ userId: "c", minute: 2, position: 3000 }),
      ],
    });
    expect(ids(computeOrder(fifo, state))).toEqual(["e2", "e3", "e1"]);
  });

  it("puts higher priority first when enabled", () => {
    const state = night({
      queue: [entry({ userId: "a", minute: 1 }), entry({ userId: "b", minute: 2, priority: 5 })],
    });
    expect(ids(computeOrder(fifo, state))).toEqual(["e2", "e1"]);
    expect(ids(computeOrder({ ...fifo, hostPriorityEnabled: false }, state))).toEqual(["e1", "e2"]);
  });
});

describe("computeOrder / round_robin_table", () => {
  it("interleaves tables: worked example from docs/QUEUE_RULES.md", () => {
    // Table 1 requests 3 songs quickly, table 2 requests 2, table 3 requests 1.
    const state = night({
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1 }), // e1
        entry({ userId: "t1-b", tableId: "T1", minute: 2 }), // e2
        entry({ userId: "t1-c", tableId: "T1", minute: 3 }), // e3
        entry({ userId: "t2-a", tableId: "T2", minute: 4 }), // e4
        entry({ userId: "t2-b", tableId: "T2", minute: 5 }), // e5
        entry({ userId: "t3-a", tableId: "T3", minute: 6 }), // e6
      ],
    });
    // Round 1: T1, T2, T3. Round 2: T1, T2. Round 3: T1.
    expect(ids(computeOrder(rr, state))).toEqual(["e1", "e4", "e6", "e2", "e5", "e3"]);
  });

  it("sends the table that sang most recently to the back of the rotation", () => {
    const state = night({
      now: at(60),
      history: [{ songId: "x", userId: "t1-z", tableId: "T1", endedAt: at(55) }],
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1 }),
        entry({ userId: "t2-a", tableId: "T2", minute: 2 }),
        entry({ userId: "t3-a", tableId: "T3", minute: 3 }),
      ],
    });
    // T2 and T3 never sang → first, by earliest request. T1 sang recently → last.
    expect(ids(computeOrder(rr, state))).toEqual(["e2", "e3", "e1"]);
  });

  it("orders tables that all sang by oldest performance first", () => {
    const state = night({
      now: at(60),
      history: [
        { songId: "x", userId: "a", tableId: "T1", endedAt: at(50) },
        { songId: "y", userId: "b", tableId: "T2", endedAt: at(30) },
        { songId: "z", userId: "c", tableId: "T3", endedAt: at(40) },
      ],
      queue: [
        entry({ userId: "a", tableId: "T1", minute: 1 }),
        entry({ userId: "b", tableId: "T2", minute: 2 }),
        entry({ userId: "c", tableId: "T3", minute: 3 }),
      ],
    });
    expect(ids(computeOrder(rr, state))).toEqual(["e2", "e3", "e1"]);
  });

  it("keeps the current singer first and counts them as having just performed", () => {
    const state = night({
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1, status: "now_singing", position: 500 }),
        entry({ userId: "t1-b", tableId: "T1", minute: 2 }),
        entry({ userId: "t2-a", tableId: "T2", minute: 3 }),
      ],
    });
    expect(ids(computeOrder(rr, state))).toEqual(["e1", "e3", "e2"]);
  });

  it("treats entries without a table as their own singer group", () => {
    const state = night({
      queue: [
        entry({ userId: "solo", tableId: null, minute: 1 }),
        entry({ userId: "solo", tableId: null, minute: 2 }),
        entry({ userId: "t1-a", tableId: "T1", minute: 3 }),
      ],
    });
    expect(ids(computeOrder(rr, state))).toEqual(["e1", "e3", "e2"]);
  });

  it("keeps host-locked entries at their index", () => {
    const state = night({
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1, position: 1000 }),
        entry({ userId: "t1-b", tableId: "T1", minute: 2, position: 2000, lockedByHost: true }),
        entry({ userId: "t2-a", tableId: "T2", minute: 3, position: 3000 }),
        entry({ userId: "t3-a", tableId: "T3", minute: 4, position: 4000 }),
      ],
    });
    // Without the lock the order would be e1, e3, e4, e2. The lock pins e2 at index 1.
    expect(ids(computeOrder(rr, state))).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("moves a prioritised entry earlier within its round only", () => {
    const state = night({
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1 }),
        entry({ userId: "t1-b", tableId: "T1", minute: 2, priority: 9 }),
        entry({ userId: "t2-a", tableId: "T2", minute: 3 }),
        entry({ userId: "t3-a", tableId: "T3", minute: 4 }),
      ],
    });
    // T1's prioritised song jumps ahead of t1-a within T1, then leads round 1.
    expect(ids(computeOrder(rr, state))).toEqual(["e2", "e3", "e4", "e1"]);
  });
});

describe("computeOrder / round_robin_singer", () => {
  it("groups by user even when they share a table", () => {
    const rules: QueueRulesConfig = { ...DEFAULT_RULES, fairness: "round_robin_singer" };
    const state = night({
      queue: [
        entry({ userId: "a", tableId: "T1", minute: 1 }),
        entry({ userId: "a", tableId: "T1", minute: 2 }),
        entry({ userId: "b", tableId: "T1", minute: 3 }),
      ],
    });
    expect(ids(computeOrder(rules, state))).toEqual(["e1", "e3", "e2"]);
  });
});

describe("reorder", () => {
  it("returns no changes when the stored order is already correct", () => {
    const state = night({
      queue: [
        entry({ userId: "a", tableId: "T1", minute: 1, position: 1000 }),
        entry({ userId: "b", tableId: "T2", minute: 2, position: 2000 }),
      ],
    });
    expect(reorder(rr, state)).toEqual([]);
  });

  it("renumbers only the entries that move", () => {
    const state = night({
      queue: [
        entry({ userId: "t1-a", tableId: "T1", minute: 1, position: 1000 }),
        entry({ userId: "t1-b", tableId: "T1", minute: 2, position: 2000 }),
        entry({ userId: "t2-a", tableId: "T2", minute: 3, position: 3000 }),
      ],
    });
    // Target: e1, e3, e2 → e1 stays at 1000, e3 → 2000, e2 → 3000.
    expect(reorder(rr, state)).toEqual([
      { id: "e3", position: 2000 },
      { id: "e2", position: 3000 },
    ]);
  });
});
