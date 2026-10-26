import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGuestNight } from "./night";
import type { GuestSession } from "./session";

// loadGuestNight runs under the guest's Supabase session. We fake a minimal client so we can
// assert the contract that fixes pentest H1: the guest is seated with the cookie's join code +
// venue id (proof the DB re-resolves), never with a bare, forgeable table id.

const rpcCalls: { name: string; args: unknown }[] = [];
let mockClient: unknown = null;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => Promise.resolve(mockClient),
}));

const session: GuestSession = {
  v: 2,
  guestId: "22222222-2222-4222-8222-222222222222",
  tableId: "11111111-1111-4111-8111-111111111111",
  tableLabel: "T1",
  joinCode: "DEMO1",
  venueId: "00000000-0000-0000-0000-000000000001",
  venueName: "Demo Karaoke Bar",
  venueSlug: "demo-bar",
  name: "Dana",
  joinedAt: "2026-10-23T18:00:00.000Z",
};

/** A chainable query builder that is also awaitable, resolving to `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return b;
}

function fakeSupabase(resultsByTable: Record<string, { data: unknown; error: unknown }>) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => builder(resultsByTable[table] ?? { data: [], error: null }),
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === "join_table") return Promise.resolve({ data: "group-1", error: null });
      return Promise.resolve({ data: [], error: null }); // venue_table_labels
    },
  };
}

afterEach(() => {
  rpcCalls.length = 0;
  mockClient = null;
});

describe("loadGuestNight — H1 join proof", () => {
  it("calls join_table with the cookie's join code + venue id, never a bare table id", async () => {
    mockClient = fakeSupabase({
      nights: {
        data: {
          id: "night-1",
          status: "open",
          started_at: "2026-10-26T18:00:00.000Z",
          closes_at: null,
          rules_snapshot: {},
        },
        error: null,
      },
      group_members: { data: [], error: null }, // not yet a participant -> triggers join_table
    });

    const result = await loadGuestNight(session);
    expect(result.ok).toBe(true);

    const join = rpcCalls.find((c) => c.name === "join_table");
    expect(join).toBeDefined();
    expect(join?.args).toEqual({ p_code: "DEMO1", p_venue_id: session.venueId });
    // The forgeable table id must not be sent as proof.
    expect(JSON.stringify(join?.args)).not.toContain("p_table_id");
    expect(JSON.stringify(join?.args)).not.toContain(session.tableId);
  });

  it("does not call join_table when the guest is already a participant of the table", async () => {
    mockClient = fakeSupabase({
      nights: {
        data: {
          id: "night-1",
          status: "open",
          started_at: "2026-10-26T18:00:00.000Z",
          closes_at: null,
          rules_snapshot: {},
        },
        error: null,
      },
      group_members: { data: [{ group_id: "group-1" }], error: null },
      groups: { data: { id: "group-1" }, error: null },
    });

    await loadGuestNight(session);
    expect(rpcCalls.find((c) => c.name === "join_table")).toBeUndefined();
  });
});
