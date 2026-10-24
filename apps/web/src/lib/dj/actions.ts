"use server";

import type { QueueEntryRow } from "@kj/db";
import { getDemoNight, setDemoNight } from "@/lib/demo/night-store";
import { getGuestSession } from "@/lib/guest/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { demoSnapshot } from "./demo-night";
import { loadDjSnapshot } from "./load";
import { applyHostAction, closeNightSnapshot } from "./queue-model";
import type { DjSnapshot, HostAction } from "./types";

export type DjActionResponse =
  | { ok: true; snapshot: DjSnapshot }
  | { ok: false; error: "unavailable" | "notStaff" | "staleNight" | "demo" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Latest snapshot for the signed-in DJ's venue (realtime hint handler and polling). */
export async function refreshDjSnapshot(): Promise<DjActionResponse> {
  const loaded = await loadDjSnapshot();
  return loaded.ok ? { ok: true, snapshot: loaded.snapshot } : { ok: false, error: loaded.reason };
}

/**
 * Apply a host action to the open night and persist the resulting changes.
 *
 * The browser already applied the same pure model optimistically; the server re-applies it
 * against fresh data so a stale client cannot write a stale order. Writes go through the
 * user's own session, so RLS (`is_venue_staff`) is the authorization check. Not yet a single
 * transaction: a transactional RPC is tracked in docs/ROADMAP.md phase 2.
 */
export async function performHostAction(
  nightId: string,
  action: HostAction,
): Promise<DjActionResponse> {
  const supabase = await createServerSupabase();
  if (!supabase) return demoHostAction(nightId, action);
  // The approve entry id comes from the browser and becomes a primary key: uuid or nothing.
  if (action.type === "approve" && !UUID_RE.test(action.entryId)) {
    return failed("approve", "entry id is not a uuid");
  }

  const loaded = await loadDjSnapshot();
  if (!loaded.ok) return { ok: false, error: loaded.reason };
  const { snapshot } = loaded;
  if (!snapshot.night || snapshot.night.id !== nightId) return { ok: false, error: "staleNight" };

  const now = new Date().toISOString();
  const result = applyHostAction(snapshot, action, now);
  const venueId = snapshot.venue.id;

  for (const insert of result.inserts) {
    const { error } = await supabase.from("queue_entries").insert({
      id: insert.entryId,
      venue_id: venueId,
      night_id: nightId,
      request_id: insert.requestId,
      position: insert.position,
    });
    if (error) return failed("insert queue_entries", error.message);
  }
  for (const change of result.requests) {
    const patch: { status?: typeof change.status; priority?: number; updated_at: string } = {
      updated_at: now,
    };
    if (change.status !== undefined) patch.status = change.status;
    if (change.priority !== undefined) patch.priority = change.priority;
    const { error } = await supabase
      .from("song_requests")
      .update(patch)
      .eq("id", change.requestId)
      .eq("night_id", nightId);
    if (error) return failed("update song_requests", error.message);
  }
  for (const change of result.entries) {
    const patch: Partial<QueueEntryRow> = { updated_at: now };
    if (change.position !== undefined) patch.position = change.position;
    if (change.lockedByHost !== undefined) patch.locked_by_host = change.lockedByHost;
    if (change.startedAt !== undefined) patch.started_at = change.startedAt;
    if (change.endedAt !== undefined) patch.ended_at = change.endedAt;
    const { error } = await supabase
      .from("queue_entries")
      .update(patch)
      .eq("id", change.entryId)
      .eq("night_id", nightId);
    if (error) return failed("update queue_entries", error.message);
  }

  return refreshDjSnapshot();
}

/**
 * Demo mode: the night of the browser's guest cookie lives in the server-side store, so the
 * guest page and the DJ console in the same browser see each other's changes. Without a guest
 * cookie there is nothing to key the store by; the console then keeps its state client-side.
 */
async function demoHostAction(nightId: string, action: HostAction): Promise<DjActionResponse> {
  const guest = await getGuestSession();
  if (!guest) return { ok: false, error: "demo" };
  const current = getDemoNight(guest.guestId);
  if (!current.night || current.night.id !== nightId || current.night.status !== "open") {
    return { ok: false, error: "staleNight" };
  }
  const result = applyHostAction(current, action, new Date().toISOString());
  setDemoNight(guest.guestId, result.snapshot);
  return { ok: true, snapshot: result.snapshot };
}

/** Open a night for the DJ's venue, snapshotting the current rules. */
export async function openNight(): Promise<DjActionResponse> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    const guest = await getGuestSession();
    if (!guest) return { ok: false, error: "demo" };
    const current = getDemoNight(guest.guestId);
    if (current.night?.status === "open") return { ok: true, snapshot: current };
    const opened: DjSnapshot = { ...demoSnapshot(), persisted: true };
    setDemoNight(guest.guestId, opened);
    return { ok: true, snapshot: opened };
  }
  const loaded = await loadDjSnapshot();
  if (!loaded.ok) return { ok: false, error: loaded.reason };
  if (loaded.snapshot.night) return { ok: true, snapshot: loaded.snapshot };

  const { data: rules } = await supabase
    .from("queue_rules")
    .select("config")
    .eq("venue_id", loaded.snapshot.venue.id)
    .maybeSingle();
  const { error } = await supabase.from("nights").insert({
    venue_id: loaded.snapshot.venue.id,
    rules_snapshot: rules?.config ?? {},
  });
  if (error) return failed("insert nights", error.message);
  return refreshDjSnapshot();
}

/**
 * Close the open night (PRD H1): the singer on the mic finishes as `done`, whatever is still
 * waiting is marked `skipped`. Same transitions as `closeNightSnapshot`.
 */
export async function closeNight(nightId: string): Promise<DjActionResponse> {
  const supabase = await createServerSupabase();
  const now = new Date().toISOString();
  if (!supabase) {
    const guest = await getGuestSession();
    if (!guest) return { ok: false, error: "demo" };
    const current = getDemoNight(guest.guestId);
    if (!current.night || current.night.id !== nightId) return { ok: false, error: "staleNight" };
    const closed = closeNightSnapshot(current, now);
    setDemoNight(guest.guestId, closed);
    return { ok: true, snapshot: closed };
  }

  const sung = await supabase
    .from("song_requests")
    .update({ status: "done", updated_at: now })
    .eq("night_id", nightId)
    .eq("status", "now_singing");
  if (sung.error) return failed("finish current singer", sung.error.message);

  const skipped = await supabase
    .from("song_requests")
    .update({ status: "skipped", updated_at: now })
    .eq("night_id", nightId)
    .in("status", ["pending", "approved", "queued"]);
  if (skipped.error) return failed("skip remaining requests", skipped.error.message);

  const ended = await supabase
    .from("queue_entries")
    .update({ ended_at: now, updated_at: now })
    .eq("night_id", nightId)
    .is("ended_at", null);
  if (ended.error) return failed("end remaining entries", ended.error.message);

  const closed = await supabase
    .from("nights")
    .update({ status: "closed", ended_at: now, updated_at: now })
    .eq("id", nightId);
  if (closed.error) return failed("close night", closed.error.message);
  return refreshDjSnapshot();
}

function failed(step: string, message: string): DjActionResponse {
  console.error(`dj action: ${step} failed`, { message });
  return { ok: false, error: "unavailable" };
}
