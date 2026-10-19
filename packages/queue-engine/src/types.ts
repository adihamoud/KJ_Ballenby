/**
 * Core types for the karaoke queue engine.
 *
 * The engine is pure: it never touches a database or the clock. Callers pass
 * the current time and the full night state in, and get decisions out.
 */

export type Fairness = "fifo" | "round_robin_table" | "round_robin_singer";

export interface QueueRulesConfig {
  /** How the queue is interleaved between tables / singers. */
  fairness: Fairness;
  /** A user may not have more than this many requests that are not yet done. */
  maxPendingPerUser: number;
  /** A table may not have more than this many requests that are not yet done. null = unlimited. */
  maxPendingPerTable: number | null;
  /** After finishing a song, a user must wait this many minutes before their next song is eligible. */
  cooldownMinutesPerUser: number;
  /** When true, new requests start as 'pending' and need a host to approve them. */
  requireHostApproval: boolean;
  /** Allow more than one singer on a request. */
  allowDuets: boolean;
  /** Upper bound on singers per request (only meaningful when allowDuets is true). */
  maxSingersPerSong: number;
  /** When true, a request's `priority` affects ordering (host sets it). */
  hostPriorityEnabled: boolean;
  /** The same song may not be queued again within this many minutes. 0 = disabled. */
  duplicateSongWindowMinutes: number;
  /** No new requests in the last N minutes before the night closes. null = disabled. */
  nightCutoffMinutesBeforeClose: number | null;
}

export type EntryStatus = "queued" | "now_singing";

export interface QueueEntry {
  id: string;
  requestId: string;
  songId: string;
  userId: string;
  tableId: string | null;
  groupId: string | null;
  singers: string[];
  priority: number;
  /** Fractional rank. Lower comes first. */
  position: number;
  lockedByHost: boolean;
  status: EntryStatus;
  /** ISO 8601 timestamp of when the request was created. */
  createdAt: string;
}

export interface HistoryItem {
  songId: string;
  userId: string;
  tableId: string | null;
  /** ISO 8601 timestamp of when the performance ended. */
  endedAt: string;
}

/** A request that exists but is not in the queue yet (awaiting host approval). */
export interface PendingRequest {
  userId: string;
  tableId: string | null;
  songId: string;
}

export interface NightState {
  /** ISO 8601 "now", injected by the caller so the engine stays pure. */
  now: string;
  nightStatus: "open" | "closed";
  /** Planned close time, if the venue has one. ISO 8601 or null. */
  closesAt: string | null;
  queue: QueueEntry[];
  history: HistoryItem[];
  pendingRequests: PendingRequest[];
}

export interface NewRequest {
  songId: string;
  userId: string;
  tableId: string | null;
  groupId: string | null;
  singers: string[];
  songActive: boolean;
}

export type ReasonCode =
  | "MAX_PENDING_USER"
  | "MAX_PENDING_TABLE"
  | "COOLDOWN"
  | "DUPLICATE_SONG"
  | "NIGHT_CLOSED"
  | "CUTOFF"
  | "TOO_MANY_SINGERS"
  | "DUETS_DISABLED"
  | "SONG_INACTIVE";

export type EvaluateResult =
  | {
      ok: true;
      /** 'pending' when host approval is required, otherwise 'queued'. */
      status: "pending" | "queued";
      /** Position to insert at (end of queue). Caller should run `reorder` afterwards. */
      position: number;
    }
  | {
      ok: false;
      reason: ReasonCode;
      /** Milliseconds until the request would be allowed, when the rejection is time-based. */
      retryAfterMs?: number;
    };

export interface PositionChange {
  id: string;
  position: number;
}
