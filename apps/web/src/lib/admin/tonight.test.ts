import { DEMO_TABLES } from "@/lib/demo/venue";
import { demoSnapshot } from "@/lib/dj/demo-night";
import { closeNightSnapshot } from "@/lib/dj/queue-model";
import { buildTableBoard } from "./tonight";

const NOW = new Date("2026-10-24T20:30:00.000Z");
const [T1, T2, T3, BAR] = DEMO_TABLES.map((t) => t.table_id) as [string, string, string, string];

describe("buildTableBoard on the demo night", () => {
  const board = buildTableBoard(demoSnapshot(NOW));
  const row = (id: string) => board.rows.find((r) => r.tableId === id)!;

  it("lists every table once, in natural label order", () => {
    expect(board.rows.map((r) => r.label)).toEqual(["Bar", "T1", "T2", "T3"]);
  });

  it("puts the singer on the mic on their table", () => {
    expect(row(T2).nowSinging?.title).toBe("Sweet Caroline");
    expect(row(T1).nowSinging).toBeNull();
  });

  it("lists waiting songs with their place in the queue, then those awaiting approval", () => {
    const waiting = row(T3).waiting;
    expect(waiting.map((s) => s.status)).toEqual(["queued", "pending"]);
    expect(waiting[0]?.place).toBeGreaterThan(0);
    expect(waiting[1]?.place).toBeNull();
    const places = board.rows.flatMap((r) => r.waiting.map((s) => s.place)).filter(Boolean);
    expect(new Set(places).size).toBe(places.length); // no two songs share a place
  });

  it("lists sung songs most recent first", () => {
    expect(row(T1).sung.map((s) => s.title)).toEqual(["Bohemian Rhapsody"]);
    expect(row(T3).sung.map((s) => s.title)).toEqual(["אבניבי"]);
  });

  it("infers guests and opening time from requests when there is no seating", () => {
    expect(row(T1).guests.map((g) => g.name)).toEqual(["דנה", "אבי"]);
    expect(row(T1).openedAt).not.toBeNull();
  });

  it("totals match the rows", () => {
    expect(board.totals.openTables).toBe(4);
    expect(board.totals.waiting).toBe(7);
    expect(board.totals.sung).toBe(2);
  });
});

describe("buildTableBoard with seating rows", () => {
  it("uses the group's creation time and members' names", () => {
    const board = buildTableBoard(demoSnapshot(NOW), {
      groups: [
        { id: "g-bar", table_id: BAR, created_at: "2026-10-24T19:00:00.000Z", is_active: true },
        { id: "g-old", table_id: BAR, created_at: "2026-10-24T18:00:00.000Z", is_active: false },
      ],
      members: [
        { group_id: "g-bar", user_id: "u-2", joined_at: "2026-10-24T19:10:00.000Z" },
        { group_id: "g-bar", user_id: "u-1", joined_at: "2026-10-24T19:00:00.000Z" },
        { group_id: "g-old", user_id: "u-3", joined_at: "2026-10-24T18:00:00.000Z" },
      ],
      profiles: [
        { id: "u-1", display_name: "Tom" },
        { id: "u-2", display_name: null },
      ],
    });
    const bar = board.rows.find((r) => r.tableId === BAR)!;
    expect(bar.openedAt).toBe("2026-10-24T19:00:00.000Z"); // the inactive group is ignored
    expect(bar.guests).toEqual([
      { userId: "u-1", name: "Tom", joinedAt: "2026-10-24T19:00:00.000Z" },
      { userId: "u-2", name: null, joinedAt: "2026-10-24T19:10:00.000Z" },
    ]);
    // Tables without a group tonight have no guests even if their requests exist.
    expect(board.rows.find((r) => r.tableId === T1)!.guests).toEqual([]);
  });
});

describe("buildTableBoard when no night is open", () => {
  it("keeps the tables but shows no songs or guests", () => {
    const closed = closeNightSnapshot(demoSnapshot(NOW), NOW.toISOString());
    const board = buildTableBoard(closed);
    expect(board.nightId).toBeNull();
    expect(board.rows).toHaveLength(4);
    expect(board.rows.every((r) => r.waiting.length === 0 && r.sung.length === 0)).toBe(true);
    expect(board.totals).toEqual({ openTables: 0, guests: 0, waiting: 0, sung: 0 });
  });
});

describe("buildTableBoard start estimates", () => {
  it("estimates a start for queued songs only, later places later", () => {
    const board = buildTableBoard(demoSnapshot(NOW));
    const songs = board.rows.flatMap((r) => r.waiting);
    for (const s of songs) {
      if (s.status === "queued") expect(s.estimatedStartAt).not.toBeNull();
      else expect(s.estimatedStartAt).toBeNull();
    }
    const queued = songs
      .filter((s) => s.status === "queued")
      .sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
    const times = queued.map((s) => Date.parse(s.estimatedStartAt!));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
