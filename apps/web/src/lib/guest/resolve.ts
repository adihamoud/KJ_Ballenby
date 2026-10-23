import type { ResolvedTableRow } from "@kj/db";
import { DEMO_TABLES } from "@/lib/demo/venue";
import { createServerSupabase } from "@/lib/supabase/server";

export { DEMO_NIGHT_ID, DEMO_TABLES, DEMO_VENUE_ID } from "@/lib/demo/venue";

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

export function resolveDemoTable(code: string): ResolveTableResult {
  const table = DEMO_TABLES.find((t) => t.join_code === code || t.table_id === code);
  return table ? { ok: true, table } : { ok: false, reason: "not_found" };
}
