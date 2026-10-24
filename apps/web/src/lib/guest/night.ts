import { parseRules } from "@kj/queue-engine";
import type { QueueEntryRow, SongRequestRow, SongRow } from "@kj/db";
import { getDemoNight } from "@/lib/demo/night-store";
import { buildNightSnapshot } from "@/lib/dj/load";
import type { DjSnapshot } from "@/lib/dj/types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GuestSession } from "./session";

export interface GuestNight {
  snapshot: DjSnapshot;
  /** `auth.uid()` of the anonymous (or signed-in) guest; the demo guest id without Supabase. */
  userId: string;
  /** The guest's group (the cookie's table) in the open night, from `group_members`. */
  groupId: string | null;
  /**
   * The table the guest actually sits at tonight (the group's table, verified by membership or
   * `join_table`), not the unsigned cookie's claim. Null when there is no open night or the join
   * failed.
   */
  tableId: string | null;
}

export type GuestNightResult =
  { ok: true; night: GuestNight } | { ok: false; reason: "noIdentity" | "unavailable" };

/**
 * Load the open night of the guest's venue as the guest is allowed to see it.
 *
 * Live mode runs under the guest's own Supabase session: RLS decides what comes back, so the
 * guest must be a participant of the night for its requests and entries to be readable at all.
 * Membership is read from `group_members`; `join_table` (a write under an advisory lock) runs
 * only when the guest is not yet in the cookie's table for this night. Without Supabase the
 * per-browser demo night is used.
 */
export async function loadGuestNight(session: GuestSession): Promise<GuestNightResult> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      ok: true,
      night: {
        snapshot: getDemoNight(session.guestId),
        userId: session.guestId,
        groupId: null,
        tableId: session.tableId,
      },
    };
  }

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, reason: "noIdentity" };

  const [nightRes, tablesRes, membersRes] = await Promise.all([
    supabase
      .from("nights")
      .select("id, status, started_at, closes_at, rules_snapshot")
      .eq("venue_id", session.venueId)
      .eq("status", "open")
      .maybeSingle(),
    // venue_tables itself is staff-only (it holds QR tokens and join codes); guests get labels
    // through this security-definer function.
    supabase.rpc("venue_table_labels", { p_venue_id: session.venueId }),
    // "group_members: read" lets a user see their own rows.
    supabase.from("group_members").select("group_id").eq("user_id", user.id),
  ]);
  if (nightRes.error) return fail("nights", nightRes.error.message);
  if (tablesRes.error) return fail("venue_tables", tablesRes.error.message);
  if (membersRes.error) return fail("group_members", membersRes.error.message);

  const night = nightRes.data;
  const generatedAt = new Date().toISOString();
  const base: DjSnapshot = {
    mode: "live",
    persisted: true,
    venue: { id: session.venueId, name: session.venueName },
    night: night
      ? { id: night.id, status: "open", startedAt: night.started_at, closesAt: night.closes_at }
      : null,
    rules: parseRules(night?.rules_snapshot ?? {}),
    tables: Object.fromEntries((tablesRes.data ?? []).map((t) => [t.id, t.label])),
    items: [],
    history: [],
    generatedAt,
  };
  if (!night) {
    return { ok: true, night: { snapshot: base, userId: user.id, groupId: null, tableId: null } };
  }

  // Participation first: the night's rows are only visible to members of one of its groups.
  // This runs on every render and poll, so it is reads only; `join_table` (a write that takes a
  // per-table advisory lock) runs once, when the guest is not yet in the cookie's table for this
  // night: the night opened after they joined, or they moved to another table.
  const myGroupIds = membersRes.data.map((m) => m.group_id);
  let groupId: string | null = null;
  if (myGroupIds.length > 0) {
    const groupRes = await supabase
      .from("groups")
      .select("id")
      .eq("night_id", night.id)
      .eq("table_id", session.tableId)
      .eq("is_active", true)
      .in("id", myGroupIds)
      .limit(1)
      .maybeSingle();
    if (groupRes.error) return fail("groups", groupRes.error.message);
    groupId = groupRes.data?.id ?? null;
  }
  if (!groupId) {
    const joined = await supabase.rpc("join_table", { p_table_id: session.tableId });
    if (joined.error) {
      console.error("join_table failed", {
        tableId: session.tableId,
        message: joined.error.message,
      });
      return fail("join_table", joined.error.message);
    }
    groupId = joined.data ?? null;
  }
  const tableId = groupId ? session.tableId : null;

  const [requestsRes, entriesRes] = await Promise.all([
    supabase
      .from("song_requests")
      .select("*")
      .eq("night_id", night.id)
      .in("status", ["pending", "approved", "queued", "now_singing", "done"]),
    supabase.from("queue_entries").select("*").eq("night_id", night.id),
  ]);
  if (requestsRes.error) return fail("song_requests", requestsRes.error.message);
  if (entriesRes.error) return fail("queue_entries", entriesRes.error.message);
  const requests = requestsRes.data as SongRequestRow[];
  const entries = entriesRes.data as QueueEntryRow[];

  const songIds = [...new Set(requests.map((r) => r.song_id))];
  const songsRes =
    songIds.length === 0
      ? { data: [] as SongRow[], error: null }
      : await supabase
          .from("songs")
          .select("id, title, artist, external_ref, duration_sec")
          .in("id", songIds);
  if (songsRes.error) return fail("songs", songsRes.error.message);

  const snapshot = buildNightSnapshot({
    base,
    requests,
    entries,
    songs: songsRes.data as Pick<
      SongRow,
      "id" | "title" | "artist" | "external_ref" | "duration_sec"
    >[],
    videos: [],
  });
  return { ok: true, night: { snapshot, userId: user.id, groupId, tableId } };
}

function fail(table: string, message: string): GuestNightResult {
  console.error(`guest night: ${table} query failed`, { message });
  return { ok: false, reason: "unavailable" };
}
