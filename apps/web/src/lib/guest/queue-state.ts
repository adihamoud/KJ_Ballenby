import { evaluateRequest } from "@kj/queue-engine";
import type { EvaluateResult, NewRequest, QueueRulesConfig } from "@kj/queue-engine";
import { nowSinging, orderedQueue, toNightState } from "@/lib/dj/queue-model";
import type { DjQueueItem, DjSnapshot } from "@/lib/dj/types";
import type { GuestQueueView, GuestRequestView } from "./request-model";

/**
 * Guest-side view of the night.
 *
 * The guest reads the same night snapshot the DJ console uses (RLS-limited in live mode, the
 * in-memory demo night otherwise) and asks the engine for the order. Nothing here decides
 * rules: `evaluateGuestRequest` is `evaluateRequest` over the snapshot, and positions come
 * from `computeOrder` through `orderedQueue`.
 */

/** Run the engine for a candidate against the night as the snapshot describes it. */
export function evaluateGuestRequest(
  snapshot: DjSnapshot,
  request: NewRequest,
  now: string = snapshot.generatedAt,
): EvaluateResult {
  return evaluateRequest(snapshot.rules, toNightState(snapshot, now), request);
}

/** What the guest sees: their own requests with positions, plus the mic and the queue length. */
export function guestQueueView(
  snapshot: DjSnapshot,
  userId: string | null,
  now: string = snapshot.generatedAt,
): GuestQueueView {
  const open = snapshot.night?.status === "open";
  const ordered = open ? orderedQueue(snapshot, now) : [];
  const singing = open ? nowSinging(snapshot) : null;
  const indexByRequest = new Map(ordered.map((item, index) => [item.requestId, index] as const));
  const waitingOffset = singing ? 1 : 0;

  const mine: GuestRequestView[] = open
    ? snapshot.items
        .filter((item) => userId !== null && item.requestedBy === userId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((item) => toGuestView(item, indexByRequest.get(item.requestId), waitingOffset))
    : [];

  return {
    mode: snapshot.mode,
    nightId: open ? (snapshot.night?.id ?? null) : null,
    nightOpen: open,
    queueLength: ordered.length,
    nowSinging: singing
      ? {
          title: singing.title,
          artist: singing.artist,
          singers: singing.singers,
          tableLabel: singing.tableLabel,
        }
      : null,
    mine,
    maxSingersPerSong: snapshot.rules.maxSingersPerSong,
    allowDuets: snapshot.rules.allowDuets,
    generatedAt: now,
  };
}

function toGuestView(
  item: DjQueueItem,
  orderIndex: number | undefined,
  waitingOffset: number,
): GuestRequestView {
  const inQueue = item.status !== "pending" && orderIndex !== undefined;
  return {
    requestId: item.requestId,
    songId: item.songId,
    title: item.title,
    artist: item.artist,
    singers: item.singers,
    note: item.note,
    status: item.status,
    position: inQueue && item.status === "queued" ? orderIndex - waitingOffset + 1 : null,
    ahead: inQueue ? orderIndex : null,
    createdAt: item.createdAt,
  };
}

export interface GuestRequestSong {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  videos: DjQueueItem["videos"];
  active: boolean;
}

export interface GuestRequestIdentity {
  userId: string;
  tableId: string | null;
  tableLabel: string | null;
  groupId: string | null;
}

export type ApplyGuestRequestResult =
  | { ok: true; snapshot: DjSnapshot; item: DjQueueItem }
  | { ok: false; reason: Extract<EvaluateResult, { ok: false }>["reason"] };

/**
 * Evaluate a guest request and, when accepted, add it to the snapshot the way `submit_request`
 * would persist it: a `pending` request without an entry, or a `queued` one at the engine's
 * position. Pure; the demo night store applies it and unit tests exercise it directly.
 */
export function applyGuestRequest(
  snapshot: DjSnapshot,
  song: GuestRequestSong,
  who: GuestRequestIdentity,
  singers: string[],
  note: string | null,
  now: string,
  ids: { requestId: string; entryId: string },
): ApplyGuestRequestResult {
  const result = evaluateGuestRequest(
    snapshot,
    {
      songId: song.id,
      songActive: song.active,
      userId: who.userId,
      tableId: who.tableId,
      groupId: who.groupId,
      singers,
    },
    now,
  );
  if (!result.ok) return { ok: false, reason: result.reason };

  const item: DjQueueItem = {
    requestId: ids.requestId,
    entryId: result.status === "queued" ? ids.entryId : null,
    songId: song.id,
    title: song.title,
    artist: song.artist,
    externalRef: null,
    durationSec: song.durationSec,
    videos: song.videos,
    requestedBy: who.userId,
    tableId: who.tableId,
    tableLabel: who.tableLabel,
    groupId: who.groupId,
    singers,
    note,
    status: result.status,
    priority: 0,
    position: result.status === "queued" ? result.position : 0,
    lockedByHost: false,
    createdAt: now,
    startedAt: null,
  };
  return {
    ok: true,
    item,
    snapshot: { ...snapshot, items: [...snapshot.items, item], generatedAt: now },
  };
}

/**
 * Remove a guest's own request while it is still waiting (`pending` or `queued`). Returns null
 * when there is nothing to cancel, so callers can tell "no-op" from "changed".
 */
export function cancelGuestRequest(
  snapshot: DjSnapshot,
  requestId: string,
  userId: string,
  now: string,
): DjSnapshot | null {
  const item = snapshot.items.find((i) => i.requestId === requestId);
  if (!item || item.requestedBy !== userId || item.status === "now_singing") return null;
  return {
    ...snapshot,
    items: snapshot.items.filter((i) => i.requestId !== requestId),
    generatedAt: now,
  };
}

/** Rules the request sheet needs before the guest submits anything. */
export function sheetLimits(rules: QueueRulesConfig): { maxSingers: number; allowDuets: boolean } {
  return {
    maxSingers: rules.allowDuets ? rules.maxSingersPerSong : 1,
    allowDuets: rules.allowDuets,
  };
}
