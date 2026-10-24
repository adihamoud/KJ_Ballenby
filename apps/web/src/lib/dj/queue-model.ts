import { computeOrder, positionBetween, reorder, tailPosition } from "@kj/queue-engine";
import type { HistoryItem, NightState, QueueEntry } from "@kj/queue-engine";
import type {
  DjHistoryItem,
  DjQueueItem,
  DjSnapshot,
  EntryChange,
  EntryInsert,
  HostAction,
  HostActionResult,
  RequestChange,
} from "./types";

/**
 * Host-side queue model.
 *
 * Maps each DJ action to the data changes listed in docs/QUEUE_RULES.md section 8 and then
 * asks the engine to `reorder()`. It never decides order itself: the only placement logic
 * here is "where does a moved entry land", which the spec defines as "between its new
 * neighbours, then locked". Pure, so the browser can apply an action optimistically and
 * the server action can apply the same function before persisting.
 */

function toEngineEntry(item: DjQueueItem): QueueEntry | null {
  if (item.status === "pending" || item.entryId === null) return null;
  return {
    id: item.entryId,
    requestId: item.requestId,
    songId: item.songId,
    userId: item.requestedBy,
    tableId: item.tableId,
    groupId: item.groupId,
    singers: item.singers,
    priority: item.priority,
    position: item.position,
    lockedByHost: item.lockedByHost,
    status: item.status,
    createdAt: item.createdAt,
  };
}

function toEngineHistory(item: DjHistoryItem): HistoryItem {
  return {
    songId: item.songId,
    userId: item.requestedBy,
    tableId: item.tableId,
    endedAt: item.endedAt,
  };
}

export function toNightState(snapshot: DjSnapshot, now: string): NightState {
  return {
    now,
    nightStatus: snapshot.night?.status ?? "closed",
    closesAt: snapshot.night?.closesAt ?? null,
    queue: snapshot.items.map(toEngineEntry).filter((e): e is QueueEntry => e !== null),
    history: snapshot.history.map(toEngineHistory),
    pendingRequests: snapshot.items
      .filter((i) => i.status === "pending")
      .map((i) => ({ userId: i.requestedBy, tableId: i.tableId, songId: i.songId })),
  };
}

/** Queued and now-singing items in engine order (now singing first). */
export function orderedQueue(snapshot: DjSnapshot, now = snapshot.generatedAt): DjQueueItem[] {
  const byEntry = new Map<string, DjQueueItem>();
  for (const item of snapshot.items) if (item.entryId) byEntry.set(item.entryId, item);
  return computeOrder(snapshot.rules, toNightState(snapshot, now))
    .map((e) => byEntry.get(e.id))
    .filter((i): i is DjQueueItem => i !== undefined);
}

/** Requests waiting for host approval, oldest first. */
export function pendingItems(snapshot: DjSnapshot): DjQueueItem[] {
  return snapshot.items
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function nowSinging(snapshot: DjSnapshot): DjQueueItem | null {
  return snapshot.items.find((i) => i.status === "now_singing") ?? null;
}

/** First queued (not singing) item in engine order, or null when the queue is empty. */
export function nextUp(snapshot: DjSnapshot, now = snapshot.generatedAt): DjQueueItem | null {
  return orderedQueue(snapshot, now).find((i) => i.status === "queued") ?? null;
}

interface Draft {
  items: DjQueueItem[];
  history: DjHistoryItem[];
  requests: Map<string, RequestChange>;
  entries: Map<string, EntryChange>;
  inserts: EntryInsert[];
}

function draftOf(snapshot: DjSnapshot): Draft {
  return {
    items: snapshot.items.map((i) => ({ ...i })),
    history: [...snapshot.history],
    requests: new Map(),
    entries: new Map(),
    inserts: [],
  };
}

function requestChange(d: Draft, requestId: string, patch: Omit<RequestChange, "requestId">) {
  d.requests.set(requestId, { ...(d.requests.get(requestId) ?? { requestId }), ...patch });
}

function entryChange(d: Draft, entryId: string, patch: Omit<EntryChange, "entryId">) {
  const insert = d.inserts.find((i) => i.entryId === entryId);
  if (insert && patch.position !== undefined) {
    // A freshly approved entry is inserted at its final position, not inserted then moved.
    insert.position = patch.position;
    const { position: _ignored, ...rest } = patch;
    void _ignored;
    if (Object.keys(rest).length === 0) return;
    patch = rest;
  }
  d.entries.set(entryId, { ...(d.entries.get(entryId) ?? { entryId }), ...patch });
}

function finish(d: Draft, item: DjQueueItem, status: "done" | "skipped", now: string) {
  requestChange(d, item.requestId, { status });
  if (item.entryId) entryChange(d, item.entryId, { endedAt: now });
  d.items = d.items.filter((i) => i.requestId !== item.requestId);
  if (status === "done") {
    d.history.push({
      requestId: item.requestId,
      songId: item.songId,
      title: item.title,
      artist: item.artist,
      singers: item.singers,
      requestedBy: item.requestedBy,
      tableId: item.tableId,
      tableLabel: item.tableLabel,
      endedAt: now,
    });
  }
}

function startItem(d: Draft, requestId: string, now: string) {
  // One singer at a time: starting the next song finishes whoever is on the mic.
  for (const singing of d.items.filter((i) => i.status === "now_singing")) {
    finish(d, singing, "done", now);
  }
  const target = d.items.find((i) => i.requestId === requestId);
  if (!target || !target.entryId) return;
  target.status = "now_singing";
  target.startedAt = now;
  requestChange(d, target.requestId, { status: "now_singing" });
  entryChange(d, target.entryId, { startedAt: now });
}

function normalizePositions(d: Draft, snapshot: DjSnapshot, now: string) {
  const interim: DjSnapshot = { ...snapshot, items: d.items, history: d.history };
  for (const c of reorder(interim.rules, toNightState(interim, now))) {
    const item = d.items.find((i) => i.entryId === c.id);
    if (item) item.position = c.position;
    entryChange(d, c.id, { position: c.position });
  }
}

function commit(snapshot: DjSnapshot, d: Draft, now: string): HostActionResult {
  let next: DjSnapshot = { ...snapshot, items: d.items, history: d.history, generatedAt: now };
  const changes = reorder(next.rules, toNightState(next, now));
  if (changes.length > 0) {
    const byEntry = new Map(changes.map((c) => [c.id, c.position] as const));
    next = {
      ...next,
      items: next.items.map((i) => {
        const position = i.entryId ? byEntry.get(i.entryId) : undefined;
        return position === undefined ? i : { ...i, position };
      }),
    };
    for (const c of changes) entryChange(d, c.id, { position: c.position });
  }
  return {
    snapshot: next,
    requests: [...d.requests.values()],
    entries: [...d.entries.values()],
    inserts: d.inserts,
  };
}

const unchanged = (snapshot: DjSnapshot): HostActionResult => ({
  snapshot,
  requests: [],
  entries: [],
  inserts: [],
});

/**
 * Close the night (PRD H1): the singer on the mic finishes as `done` (they did sing, so cooldown
 * and history see it), everything still waiting is `skipped`, and the night is marked closed.
 * Pure; the server persists the same transitions with bulk updates.
 */
export function closeNightSnapshot(snapshot: DjSnapshot, now: string): DjSnapshot {
  const d = draftOf(snapshot);
  for (const item of [...d.items]) {
    finish(d, item, item.status === "now_singing" ? "done" : "skipped", now);
  }
  return {
    ...snapshot,
    night: snapshot.night ? { ...snapshot.night, status: "closed" } : null,
    items: d.items,
    history: d.history,
    generatedAt: now,
  };
}

/**
 * Apply one host action. `now` is injected (ISO 8601) so results are reproducible. The entry id
 * for `approve` travels inside the action: the browser mints it, applies the action optimistically
 * and sends the same action to the server, so both sides name the new `queue_entries` row alike.
 */
export function applyHostAction(
  snapshot: DjSnapshot,
  action: HostAction,
  now: string,
): HostActionResult {
  const d = draftOf(snapshot);
  const byRequest = (id: string) => d.items.find((i) => i.requestId === id);
  const byEntry = (id: string) => d.items.find((i) => i.entryId === id);

  switch (action.type) {
    case "approve": {
      const item = byRequest(action.requestId);
      if (!item || item.status !== "pending") return unchanged(snapshot);
      if (d.items.some((i) => i.entryId === action.entryId)) return unchanged(snapshot);
      const entryId = action.entryId;
      item.status = "queued";
      item.entryId = entryId;
      item.position = tailPosition(d.items.filter((i) => i.entryId).map((i) => i.position));
      requestChange(d, item.requestId, { status: "queued" });
      d.inserts.push({ entryId, requestId: item.requestId, position: item.position });
      return commit(snapshot, d, now);
    }
    case "start": {
      const item = byEntry(action.entryId);
      if (!item || item.status !== "queued") return unchanged(snapshot);
      startItem(d, item.requestId, now);
      return commit(snapshot, d, now);
    }
    case "done": {
      const item = byEntry(action.entryId);
      if (!item || item.status === "pending") return unchanged(snapshot);
      finish(d, item, "done", now);
      if (action.startNext) {
        const interim: DjSnapshot = { ...snapshot, items: d.items, history: d.history };
        const next = nextUp(interim, now);
        if (next) startItem(d, next.requestId, now);
      }
      return commit(snapshot, d, now);
    }
    case "skip": {
      const item = byRequest(action.requestId);
      if (!item) return unchanged(snapshot);
      finish(d, item, "skipped", now);
      return commit(snapshot, d, now);
    }
    case "pin": {
      const item = byEntry(action.entryId);
      if (!item || item.status !== "queued" || item.lockedByHost === action.locked) {
        return unchanged(snapshot);
      }
      // Guest requests land at the stored tail while the display follows the engine's fair
      // order, so stored positions can lag the displayed order. A lock anchors the entry at its
      // stored index; renumber first so the pinned song keeps the slot the DJ is looking at.
      if (action.locked) normalizePositions(d, snapshot, now);
      item.lockedByHost = action.locked;
      entryChange(d, action.entryId, { lockedByHost: action.locked });
      return commit(snapshot, d, now);
    }
    case "priority": {
      const item = byRequest(action.requestId);
      if (!item || item.priority === action.priority) return unchanged(snapshot);
      item.priority = action.priority;
      requestChange(d, item.requestId, { priority: action.priority });
      return commit(snapshot, d, now);
    }
    case "move": {
      const item = byEntry(action.entryId);
      if (!item || item.status !== "queued") return unchanged(snapshot);
      // Stored positions may lag behind engine order (e.g. a stale client). Renumber first so
      // "between the displayed neighbours" and "between the stored neighbours" agree.
      normalizePositions(d, snapshot, now);
      const queued = d.items
        .filter((i) => i.status === "queued")
        .sort((a, b) => a.position - b.position);
      const index = queued.findIndex((i) => i.entryId === action.entryId);
      const targetIndex = action.direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= queued.length) {
        return unchanged(snapshot);
      }
      // Land between the new neighbours (spec section 8, drag-reorder) and lock there so
      // the next reorder() does not undo the move.
      const [before, after] =
        action.direction === "up"
          ? [queued[targetIndex - 1], queued[targetIndex]]
          : [queued[targetIndex], queued[targetIndex + 1]];
      const lo = before?.position;
      const hi = after?.position;
      const position =
        lo !== undefined && hi !== undefined && hi <= lo ? lo + 0.5 : positionBetween(lo, hi);
      item.position = position;
      item.lockedByHost = true;
      entryChange(d, action.entryId, { position, lockedByHost: true });
      return commit(snapshot, d, now);
    }
  }
}
