import type { VenueRole } from "@kj/db";
import { createServerSupabase } from "@/lib/supabase/server";

export interface StaffMembership {
  venueId: string;
  venueName: string;
  role: VenueRole;
}

/**
 * The signed-in user's staff membership, if any, for the home page's staff shortcuts. The lookup is
 * filtered to the caller (not left to RLS); the first (oldest) membership wins until a venue switcher
 * exists. There is one staff role now (owner = admin = dj = admin, see docs/DECISIONS.md). Null for
 * guests, for users without a membership, and when Supabase is not configured (the home page is
 * unreachable then anyway). Never throws: a failed lookup just hides the shortcuts.
 */
export async function loadStaffMembership(): Promise<StaffMembership | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: membership, error: memberError } = await supabase
    .from("venue_members")
    .select("venue_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (memberError) {
    console.error("staff membership: venue_members query failed", { message: memberError.message });
    return null;
  }
  if (!membership) return null;

  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("name")
    .eq("id", membership.venue_id)
    .maybeSingle();
  if (venueError) {
    console.error("staff membership: venues query failed", { message: venueError.message });
    return null;
  }
  return { venueId: membership.venue_id, venueName: venue?.name ?? "", role: membership.role };
}
