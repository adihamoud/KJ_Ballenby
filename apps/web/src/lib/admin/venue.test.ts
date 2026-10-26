import { afterEach, describe, expect, it, vi } from "vitest";

// ADR-014: one staff role. loadAdminVenue grants admin to ANY membership (no owner/admin filter)
// and looks the membership up for the caller (filtered by user_id, not just RLS). React's cache()
// needs a request context, so stub it to identity for the unit test.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

let mockClient: unknown = null;
const eqCalls: { table: string; col: string; val: unknown }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => Promise.resolve(mockClient),
}));

const { loadAdminVenue } = await import("./venue");

function fakeSupabase(results: Record<string, { data: unknown; error: unknown }>) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) b[m] = () => b;
      b.eq = (col: string, val: unknown) => {
        eqCalls.push({ table, col, val });
        return b;
      };
      b.maybeSingle = () => Promise.resolve(results[table] ?? { data: null, error: null });
      b.single = () => Promise.resolve(results[table] ?? { data: null, error: null });
      return b;
    },
  };
}

afterEach(() => {
  mockClient = null;
  eqCalls.length = 0;
});

describe("loadAdminVenue — ADR-014 single admin role", () => {
  it("grants admin to any member and filters the lookup by the caller's user id", async () => {
    mockClient = fakeSupabase({
      venue_members: { data: { venue_id: "venue-1" }, error: null },
      venues: { data: { id: "venue-1", slug: "demo-bar", name: "Demo" }, error: null },
    });

    const result = await loadAdminVenue();
    expect(result).toEqual({
      ok: true,
      venue: { id: "venue-1", slug: "demo-bar", name: "Demo", role: "admin", mode: "live" },
    });
    // The membership must be scoped to the caller, not left to RLS to filter.
    expect(eqCalls).toContainEqual({ table: "venue_members", col: "user_id", val: "user-1" });
  });

  it("returns notStaff when the caller has no membership", async () => {
    mockClient = fakeSupabase({
      venue_members: { data: null, error: null },
    });

    const result = await loadAdminVenue();
    expect(result).toEqual({ ok: false, reason: "notStaff" });
  });
});
