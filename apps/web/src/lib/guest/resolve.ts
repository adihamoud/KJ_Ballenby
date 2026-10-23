import type { ResolvedTableRow } from "@kj/db";
import { createServerSupabase } from "@/lib/supabase/server";

export type ResolveTableResult =
  { ok: true; table: ResolvedTableRow } | { ok: false; reason: "not_found" | "unavailable" };

/**
 * Map a normalized QR token or join code to its venue and table via the
 * `resolve_table` RPC (callable by anonymous users, see migration 20261023000000).
 *
 * Without Supabase configured (local preview without secrets, CI e2e) the demo
 * venue from `supabase/seed.sql` is served from memory so the flow stays testable.
 */
export async function resolveTable(code: string): Promise<ResolveTableResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return resolveDemoTable(code);

  const { data, error } = await supabase.rpc("resolve_table", { p_code: code });
  if (error) {
    console.error("resolve_table failed", { code, message: error.message });
    return { ok: false, reason: "unavailable" };
  }
  const table = data?.[0];
  return table ? { ok: true, table } : { ok: false, reason: "not_found" };
}

const DEMO_VENUE = {
  venue_id: "00000000-0000-0000-0000-000000000001",
  venue_name: "Demo Karaoke Bar",
  venue_slug: "demo-bar",
  night_id: null,
  night_open: false,
} as const;

/** Mirrors the tables in `supabase/seed.sql`; QR tokens are fixed so e2e can hit `/j/<token>`. */
export const DEMO_TABLES: readonly ResolvedTableRow[] = [
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d001",
    table_label: "T1",
    join_code: "DEMO1",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d002",
    table_label: "T2",
    join_code: "DEMO2",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d003",
    table_label: "T3",
    join_code: "DEMO3",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d00b",
    table_label: "Bar",
    join_code: "DEMOB",
  },
];

export function resolveDemoTable(code: string): ResolveTableResult {
  const table = DEMO_TABLES.find((t) => t.join_code === code || t.table_id === code);
  return table ? { ok: true, table } : { ok: false, reason: "not_found" };
}
