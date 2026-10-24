import { loadDjSnapshot } from "@/lib/dj/load";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildTableBoard } from "./tonight";
import type { TableBoard, TonightGroup, TonightMember, TonightProfile } from "./tonight";

export type TonightBoardResult =
  { ok: true; board: TableBoard } | { ok: false; reason: "notStaff" | "unavailable" };

/**
 * The "Tables tonight" board for the signed-in staff member's venue: tonight's snapshot (same as
 * the DJ console) plus the night's seating. Staff read groups, members and the participants'
 * display names under RLS ("groups: read", "group_members: read", "profiles: staff read
 * participants"); no service role. The demo night has no seating, so guests are inferred.
 */
export async function loadTonightBoard(): Promise<TonightBoardResult> {
  const loaded = await loadDjSnapshot();
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const { snapshot } = loaded;

  const supabase = await createServerSupabase();
  if (!supabase || snapshot.mode === "demo" || snapshot.night?.status !== "open") {
    return { ok: true, board: buildTableBoard(snapshot) };
  }

  const groupsRes = await supabase
    .from("groups")
    .select("id, table_id, created_at, is_active")
    .eq("night_id", snapshot.night.id);
  if (groupsRes.error) return fail("groups", groupsRes.error.message);
  const groups = groupsRes.data as TonightGroup[];

  let members: TonightMember[] = [];
  let profiles: TonightProfile[] = [];
  if (groups.length > 0) {
    const membersRes = await supabase
      .from("group_members")
      .select("group_id, user_id, joined_at")
      .in(
        "group_id",
        groups.map((g) => g.id),
      );
    if (membersRes.error) return fail("group_members", membersRes.error.message);
    members = membersRes.data as TonightMember[];

    const userIds = [...new Set(members.map((m) => m.user_id))];
    if (userIds.length > 0) {
      const profilesRes = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (profilesRes.error) return fail("profiles", profilesRes.error.message);
      profiles = profilesRes.data as TonightProfile[];
    }
  }

  return { ok: true, board: buildTableBoard(snapshot, { groups, members, profiles }) };
}

function fail(table: string, message: string): TonightBoardResult {
  console.error(`tonight board: ${table} query failed`, { message });
  return { ok: false, reason: "unavailable" };
}
