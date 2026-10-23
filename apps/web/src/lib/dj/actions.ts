"use server";

import type { QueueEntryRow } from "@kj/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadDjSnapshot } from "./load";
import { applyHostAction } from "./queue-model";
import type { DjSnapshot, HostAction } from "./types";

export type DjActionResponse =
  | { ok: true; snapshot: DjSnapshot }
  | { ok: false; error: "unavailable" | "notStaff" | "staleNight" | "demo" };

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
  if (!supabase) return { ok: false, error: "demo" };

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

/** Open a night for the DJ's venue, snapshotting the current rules. */
export async function openNight(): Promise<DjActionResponse> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "demo" };
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

/** Close the open night; whatever is still waiting is marked skipped (PRD H1). */
export async function closeNight(nightId: string): Promise<DjActionResponse> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "demo" };
  const now = new Date().toISOString();

  const skipped = await supabase
    .from("song_requests")
    .update({ status: "skipped", updated_at: now })
    .eq("night_id", nightId)
    .in("status", ["pending", "approved", "queued", "now_singing"]);
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
