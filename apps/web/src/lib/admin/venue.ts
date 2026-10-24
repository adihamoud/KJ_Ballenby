import { cache } from "react";
import type { VenueRole, VenueTableRow } from "@kj/db";
import { parseRules } from "@kj/queue-engine";
import type { QueueRulesConfig } from "@kj/queue-engine";
import { getDemoVenue } from "@/lib/demo/admin-store";
import { createServerSupabase } from "@/lib/supabase/server";
import { readDemoSandboxId } from "./demo-sandbox";

export interface AdminVenue {
  id: string;
  slug: string;
  name: string;
  /** The signed-in user's role; always owner or admin here. Demo mode reports owner. */
  role: VenueRole;
  mode: "live" | "demo";
}

export type AdminVenueResult =
  { ok: true; venue: AdminVenue } | { ok: false; reason: "notStaff" | "notAdmin" | "unavailable" };

const ADMIN_ROLES: readonly VenueRole[] = ["owner", "admin"];

/**
 * The venue the signed-in user administers. RLS limits `venue_members` to the user's own
 * memberships, so the first owner/admin row is theirs; a user who is only a DJ gets
 * `notAdmin`, a user with no membership `notStaff`. Without Supabase configured the
 * in-memory demo venue is served so the pages can be exercised and e2e-tested.
 *
 * Wrapped in React `cache` so the layout and the page share one lookup per request.
 */
export const loadAdminVenue = cache(async (): Promise<AdminVenueResult> => {
  const supabase = await createServerSupabase();
  if (!supabase) {
    const demo = getDemoVenue(await readDemoSandboxId());
    return { ok: true, venue: { ...demo.venue, role: "owner", mode: "demo" } };
  }

  const { data: memberships, error: memberError } = await supabase
    .from("venue_members")
    .select("venue_id, role")
    .order("created_at");
  if (memberError) return fail("venue_members", memberError.message);
  if (!memberships || memberships.length === 0) return { ok: false, reason: "notStaff" };
  const membership = memberships.find((m) => ADMIN_ROLES.includes(m.role));
  if (!membership) return { ok: false, reason: "notAdmin" };

  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("id, slug, name")
    .eq("id", membership.venue_id)
    .single();
  if (venueError) return fail("venues", venueError.message);
  return {
    ok: true,
    venue: {
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      role: membership.role,
      mode: "live",
    },
  };
});

export type AdminTablesResult =
  { ok: true; tables: VenueTableRow[] } | { ok: false; reason: "unavailable" };

/** Every table of the venue, active or not, oldest first. */
export async function loadAdminTables(venue: AdminVenue): Promise<AdminTablesResult> {
  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    return { ok: true, tables: getDemoVenue(await readDemoSandboxId()).tables };
  }
  const { data, error } = await supabase
    .from("venue_tables")
    .select("*")
    .eq("venue_id", venue.id)
    .order("created_at")
    .order("label");
  if (error) {
    console.error("admin tables: venue_tables query failed", { message: error.message });
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, tables: data };
}

export type AdminRulesResult =
  { ok: true; rules: QueueRulesConfig } | { ok: false; reason: "unavailable" };

/** The venue's stored rules, completed with defaults; a venue without a row gets the defaults. */
export async function loadAdminRules(venue: AdminVenue): Promise<AdminRulesResult> {
  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    return { ok: true, rules: getDemoVenue(await readDemoSandboxId()).rules };
  }
  const { data, error } = await supabase
    .from("queue_rules")
    .select("config")
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (error) {
    console.error("admin rules: queue_rules query failed", { message: error.message });
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, rules: parseRules(data?.config ?? {}) };
}

function fail(table: string, message: string): AdminVenueResult {
  console.error(`admin venue: ${table} query failed`, { message });
  return { ok: false, reason: "unavailable" };
}
