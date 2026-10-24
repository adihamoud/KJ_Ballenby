"use server";

import type { SearchSongRow } from "@kj/db";
import { setDemoNight } from "@/lib/demo/night-store";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEMO_CATALOG } from "./demo-catalog";
import { loadGuestNight } from "./night";
import {
  applyGuestRequest,
  cancelGuestRequest,
  evaluateGuestRequest,
  guestQueueView,
} from "./queue-state";
import type { GuestRequestSong } from "./queue-state";
import { isReasonCode, normalizeNote, normalizeSingers } from "./request-model";
import type {
  CreateRequestInput,
  CreateRequestResponse,
  GuestActionError,
  GuestQueueResponse,
} from "./request-model";
import { getGuestSession } from "./session";
import type { GuestSession } from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guest's current view of the night (initial render, realtime hint handler, polling). */
export async function refreshGuestQueue(): Promise<GuestQueueResponse> {
  const session = await getGuestSession();
  if (!session) return { ok: false, kind: "error", error: "noSession" };
  const loaded = await loadGuestNight(session);
  if (!loaded.ok) return { ok: false, kind: "error", error: loaded.reason };
  return { ok: true, view: guestQueueView(loaded.night.snapshot, loaded.night.userId) };
}

/**
 * Request a song for the guest's table (ARCHITECTURE.md section 3.1).
 *
 * The engine decides first, on the night as the guest can see it; a rejection returns the reason
 * code and writes nothing. An accepted request goes through the `submit_request` RPC, which
 * inserts the request and its queue entry in one transaction and re-checks the per-user quota
 * under a lock. Identity is the guest's Supabase session (ADR-009), never the cookie.
 */
export async function createSongRequest(input: CreateRequestInput): Promise<CreateRequestResponse> {
  const session = await getGuestSession();
  if (!session) return { ok: false, kind: "error", error: "noSession" };

  const songId = typeof input?.songId === "string" ? input.songId : "";
  const singers = normalizeSingers(input?.singers);
  const note = normalizeNote(input?.note);
  if (!songId) return { ok: false, kind: "error", error: "invalidInput" };

  const supabase = await createServerSupabase();
  if (!supabase) return createDemoRequest(session, songId, singers, note);
  if (!UUID_RE.test(songId)) return { ok: false, kind: "error", error: "invalidInput" };

  const loaded = await loadGuestNight(session);
  if (!loaded.ok) return { ok: false, kind: "error", error: loaded.reason };
  const { snapshot, userId, groupId, tableId } = loaded.night;

  // RLS hides inactive songs and other venues' songs, so "not found" means "not requestable".
  const songRes = await supabase
    .from("songs")
    .select("id, title, artist, duration_sec, is_active")
    .eq("id", songId)
    .eq("venue_id", session.venueId)
    .maybeSingle();
  if (songRes.error) return failed("songs", songRes.error.message);
  const song = songRes.data;

  const now = new Date().toISOString();
  const decision = evaluateGuestRequest(
    snapshot,
    {
      songId,
      songActive: song?.is_active ?? false,
      userId,
      // The verified table, not the cookie's claim, so per-table rules use the real lane.
      tableId,
      groupId,
      singers,
    },
    now,
  );
  if (!decision.ok) return { ok: false, kind: "rejected", reason: decision.reason };
  if (!snapshot.night) return { ok: false, kind: "rejected", reason: "NIGHT_CLOSED" };

  const submitted = await supabase.rpc("submit_request", {
    p_night_id: snapshot.night.id,
    p_song_id: songId,
    p_singers: singers,
    p_note: note,
    p_position: decision.status === "queued" ? decision.position : null,
  });
  if (submitted.error) return failed("submit_request", submitted.error.message);
  const row = submitted.data?.[0];
  if (!row) return failed("submit_request", "no row returned");
  if (row.reason !== null || !row.request_id) {
    if (isReasonCode(row.reason)) return { ok: false, kind: "rejected", reason: row.reason };
    if (row.reason === "NOT_PARTICIPANT") {
      return { ok: false, kind: "error", error: "notParticipant" };
    }
    return failed("submit_request", `unexpected reason ${String(row.reason)}`);
  }

  const after = await loadGuestNight(session);
  if (!after.ok) return { ok: false, kind: "error", error: after.reason };
  return {
    ok: true,
    requestId: row.request_id,
    view: guestQueueView(after.night.snapshot, after.night.userId),
  };
}

/** Withdraw one of the guest's own requests while it is pending or queued. */
export async function cancelSongRequest(requestId: string): Promise<GuestQueueResponse> {
  const session = await getGuestSession();
  if (!session) return { ok: false, kind: "error", error: "noSession" };
  if (typeof requestId !== "string" || !requestId) {
    return { ok: false, kind: "error", error: "invalidInput" };
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    const loaded = await loadGuestNight(session);
    if (!loaded.ok) return { ok: false, kind: "error", error: loaded.reason };
    const now = new Date().toISOString();
    const next = cancelGuestRequest(loaded.night.snapshot, requestId, session.guestId, now);
    if (next) setDemoNight(session.guestId, next);
    return { ok: true, view: guestQueueView(next ?? loaded.night.snapshot, session.guestId, now) };
  }
  if (!UUID_RE.test(requestId)) return { ok: false, kind: "error", error: "invalidInput" };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, kind: "error", error: "noIdentity" };

  // "song_requests: cancel own pending" is the authorization; the trigger closes the entry.
  const { error } = await supabase
    .from("song_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requested_by", auth.user.id)
    .in("status", ["pending", "approved", "queued"]);
  if (error) return failed("cancel song_requests", error.message);
  return refreshGuestQueue();
}

async function createDemoRequest(
  session: GuestSession,
  songId: string,
  singers: string[],
  note: string | null,
): Promise<CreateRequestResponse> {
  const loaded = await loadGuestNight(session);
  if (!loaded.ok) return { ok: false, kind: "error", error: loaded.reason };
  const { snapshot } = loaded.night;
  const catalogSong = DEMO_CATALOG.find((s) => s.id === songId);
  const song: GuestRequestSong = catalogSong
    ? toRequestSong(catalogSong)
    : { id: songId, title: "", artist: "", durationSec: null, videos: [], active: false };

  const now = new Date().toISOString();
  const result = applyGuestRequest(
    snapshot,
    song,
    {
      userId: session.guestId,
      tableId: session.tableId,
      tableLabel: session.tableLabel,
      groupId: null,
    },
    singers,
    note,
    now,
    { requestId: crypto.randomUUID(), entryId: crypto.randomUUID() },
  );
  if (!result.ok) return { ok: false, kind: "rejected", reason: result.reason };
  setDemoNight(session.guestId, result.snapshot);
  return {
    ok: true,
    requestId: result.item.requestId,
    view: guestQueueView(result.snapshot, session.guestId, now),
  };
}

function toRequestSong(song: SearchSongRow): GuestRequestSong {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    durationSec: song.duration_sec,
    videos: song.videos.map((v) => ({
      youtubeId: v.youtube_id,
      label: v.label,
      durationSec: v.duration_sec,
      embeddable: v.embeddable,
    })),
    active: true,
  };
}

function failed(
  step: string,
  message: string,
): { ok: false; kind: "error"; error: GuestActionError } {
  console.error(`guest request: ${step} failed`, { message });
  return { ok: false, kind: "error", error: "unavailable" };
}
