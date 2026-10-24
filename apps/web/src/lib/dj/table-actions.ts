"use server";

import { createServerSupabase } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TableSeating {
  /** When the table's group was created tonight; null when nobody sat down yet. */
  openedAt: string | null;
  guests: { userId: string; name: string | null; joinedAt: string }[];
}

export type TableSeatingResponse =
  { ok: true; seating: TableSeating | null } | { ok: false; error: "invalidInput" | "unavailable" };

/**
 * Who sits at one table tonight, for the DJ console's table card. Read under the caller's session:
 * staff see groups, members and participants' display names ("groups: read", "group_members:
 * read", "profiles: staff read participants"); anyone else gets empty results. `seating: null`
 * without Supabase (demo night), where the card infers guests from requests instead.
 */
export async function loadTableSeating(
  nightId: string,
  tableId: string,
): Promise<TableSeatingResponse> {
  if (!UUID_RE.test(nightId) || !UUID_RE.test(tableId)) {
    return { ok: false, error: "invalidInput" };
  }
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: true, seating: null };

  const groupsRes = await supabase
    .from("groups")
    .select("id, created_at")
    .eq("night_id", nightId)
    .eq("table_id", tableId)
    .eq("is_active", true);
  if (groupsRes.error) return failed("groups", groupsRes.error.message);
  const groups = groupsRes.data;
  if (groups.length === 0) return { ok: true, seating: { openedAt: null, guests: [] } };

  const membersRes = await supabase
    .from("group_members")
    .select("user_id, joined_at")
    .in(
      "group_id",
      groups.map((g) => g.id),
    )
    .order("joined_at");
  if (membersRes.error) return failed("group_members", membersRes.error.message);
  const members = membersRes.data;

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const names = new Map<string, string | null>();
  if (userIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    if (profilesRes.error) return failed("profiles", profilesRes.error.message);
    for (const p of profilesRes.data) names.set(p.id, p.display_name);
  }

  const openedAt = groups.map((g) => g.created_at).sort()[0] ?? null;
  return {
    ok: true,
    seating: {
      openedAt,
      guests: members.map((m) => ({
        userId: m.user_id,
        name: names.get(m.user_id) ?? null,
        joinedAt: m.joined_at,
      })),
    },
  };
}

function failed(step: string, message: string): TableSeatingResponse {
  console.error(`table seating: ${step} failed`, { message });
  return { ok: false, error: "unavailable" };
}
