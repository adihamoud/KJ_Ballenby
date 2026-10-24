import { parseRules } from "@kj/queue-engine";
import type { QueueEntryRow, SongRequestRow, SongRow, SongVideoRow, VenueTableRow } from "@kj/db";
import { getDemoNight } from "@/lib/demo/night-store";
import { getGuestSession } from "@/lib/guest/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { demoSnapshot } from "./demo-night";
import type { DjHistoryItem, DjQueueItem, DjSnapshot } from "./types";

export type DjLoadResult =
  { ok: true; snapshot: DjSnapshot } | { ok: false; reason: "notStaff" | "unavailable" };

// `approved` is transitional (buildNightSnapshot maps it to queued or pending); include it so
// the console sees the same rows the guest loader does.
const ACTIVE_STATUSES = ["pending", "approved", "queued", "now_singing"] as const;

/**
 * Load everything the DJ console needs for the signed-in user's venue. Falls back to the
 * in-memory demo night when Supabase is not configured. RLS limits every query to venues
 * where the user is staff, so this never needs the service role.
 */
export async function loadDjSnapshot(): Promise<DjLoadResult> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    // One demo night per browser: a guest who joined in this browser sees their requests here.
    const guest = await getGuestSession();
    return { ok: true, snapshot: guest ? getDemoNight(guest.guestId) : demoSnapshot() };
  }

  const { data: membership, error: memberError } = await supabase
    .from("venue_members")
    .select("venue_id")
    .limit(1)
    .maybeSingle();
  if (memberError) return fail("venue_members", memberError.message);
  if (!membership) return { ok: false, reason: "notStaff" };
  const venueId = membership.venue_id;

  const [venueRes, rulesRes, nightRes, tablesRes] = await Promise.all([
    supabase.from("venues").select("id, name").eq("id", venueId).single(),
    supabase.from("queue_rules").select("config").eq("venue_id", venueId).maybeSingle(),
    supabase
      .from("nights")
      .select("id, status, started_at, closes_at, rules_snapshot")
      .eq("venue_id", venueId)
      .eq("status", "open")
      .maybeSingle(),
    supabase.from("venue_tables").select("id, label").eq("venue_id", venueId),
  ]);
  if (venueRes.error) return fail("venues", venueRes.error.message);
  if (rulesRes.error) return fail("queue_rules", rulesRes.error.message);
  if (nightRes.error) return fail("nights", nightRes.error.message);
  if (tablesRes.error) return fail("venue_tables", tablesRes.error.message);

  const night = nightRes.data;
  const rules = parseRules(night ? night.rules_snapshot : (rulesRes.data?.config ?? {}));
  const tables = Object.fromEntries(
    (tablesRes.data as Pick<VenueTableRow, "id" | "label">[]).map((t) => [t.id, t.label]),
  );
  const generatedAt = new Date().toISOString();
  const base: DjSnapshot = {
    mode: "live",
    persisted: true,
    venue: { id: venueRes.data.id, name: venueRes.data.name },
    night: night
      ? { id: night.id, status: "open", startedAt: night.started_at, closesAt: night.closes_at }
      : null,
    rules,
    tables,
    items: [],
    history: [],
    generatedAt,
  };
  if (!night) return { ok: true, snapshot: base };

  const [requestsRes, entriesRes] = await Promise.all([
    supabase
      .from("song_requests")
      .select("*")
      .eq("night_id", night.id)
      .in("status", [...ACTIVE_STATUSES, "done"]),
    supabase.from("queue_entries").select("*").eq("night_id", night.id),
  ]);
  if (requestsRes.error) return fail("song_requests", requestsRes.error.message);
  if (entriesRes.error) return fail("queue_entries", entriesRes.error.message);
  const requests = requestsRes.data as SongRequestRow[];
  const entries = entriesRes.data as QueueEntryRow[];

  const songIds = [...new Set(requests.map((r) => r.song_id))];
  const [songsRes, videosRes] =
    songIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
          supabase.from("songs").select("*").in("id", songIds),
          supabase
            .from("song_videos")
            .select("*")
            .in("song_id", songIds)
            .eq("is_active", true)
            .order("sort_order"),
        ]);
  if (songsRes.error) return fail("songs", songsRes.error.message);
  if (videosRes.error) return fail("song_videos", videosRes.error.message);

  return {
    ok: true,
    snapshot: buildNightSnapshot({
      base,
      requests,
      entries,
      songs: songsRes.data as SongRow[],
      videos: videosRes.data as SongVideoRow[],
    }),
  };
}

/**
 * Flatten request, entry and song rows into the snapshot the DJ console and the guest queue
 * share. Pure, so the guest loader (RLS-limited rows) and the DJ loader use the same mapping.
 */
export function buildNightSnapshot({
  base,
  requests,
  entries,
  songs: songRows,
  videos,
}: {
  base: DjSnapshot;
  requests: SongRequestRow[];
  entries: QueueEntryRow[];
  songs: Pick<SongRow, "id" | "title" | "artist" | "external_ref" | "duration_sec">[];
  videos: SongVideoRow[];
}): DjSnapshot {
  const tableLabels = base.tables;
  const songs = new Map(songRows.map((s) => [s.id, s]));
  const videosBySong = new Map<string, SongVideoRow[]>();
  for (const v of videos) {
    const list = videosBySong.get(v.song_id) ?? [];
    list.push(v);
    videosBySong.set(v.song_id, list);
  }
  const entryByRequest = new Map(entries.map((e) => [e.request_id, e]));

  const items: DjQueueItem[] = [];
  const history: DjHistoryItem[] = [];
  for (const r of requests) {
    const song = songs.get(r.song_id);
    if (!song) continue;
    const entry = entryByRequest.get(r.id);
    const tableLabel = r.table_id ? (tableLabels[r.table_id] ?? null) : null;
    if (r.status === "done") {
      history.push({
        requestId: r.id,
        songId: r.song_id,
        title: song.title,
        artist: song.artist,
        singers: r.singers,
        requestedBy: r.requested_by,
        tableId: r.table_id,
        tableLabel,
        endedAt: entry?.ended_at ?? r.updated_at,
      });
      continue;
    }
    // `approved` is a transitional status: with an entry it is in the queue, without one it waits.
    const status: DjQueueItem["status"] | null =
      r.status === "pending" || r.status === "queued" || r.status === "now_singing"
        ? r.status
        : r.status === "approved"
          ? entry
            ? "queued"
            : "pending"
          : null;
    if (status === null) continue;
    items.push({
      requestId: r.id,
      entryId: status === "pending" ? null : (entry?.id ?? null),
      songId: r.song_id,
      title: song.title,
      artist: song.artist,
      externalRef: song.external_ref,
      durationSec: song.duration_sec,
      videos: (videosBySong.get(song.id) ?? []).map((v) => ({
        youtubeId: v.youtube_id,
        label: v.label,
        durationSec: v.duration_sec,
        embeddable: v.embeddable,
      })),
      requestedBy: r.requested_by,
      tableId: r.table_id,
      tableLabel,
      groupId: r.group_id,
      singers: r.singers,
      note: r.note,
      status,
      priority: r.priority,
      position: entry ? Number(entry.position) : 0,
      lockedByHost: entry?.locked_by_host ?? false,
      createdAt: r.created_at,
      startedAt: entry?.started_at ?? null,
    });
  }
  history.sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  return { ...base, items, history };
}

function fail(table: string, message: string): DjLoadResult {
  console.error(`dj snapshot: ${table} query failed`, { message });
  return { ok: false, reason: "unavailable" };
}
