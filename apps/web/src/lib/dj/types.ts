import type { QueueRulesConfig, Fairness } from "@kj/queue-engine";

export type { Fairness, QueueRulesConfig };

/** Request statuses the DJ console shows. Finished requests move to `history`. */
export type DjItemStatus = "pending" | "queued" | "now_singing";

export interface DjVideo {
  youtubeId: string;
  label: string | null;
  durationSec: number | null;
  embeddable: boolean;
}

/**
 * One request as the DJ sees it: the request, its queue entry (when it has one) and the
 * song/table it refers to, flattened so the console never joins on the client.
 */
export interface DjQueueItem {
  requestId: string;
  /** Null while the request is `pending` (no `queue_entries` row yet). */
  entryId: string | null;
  songId: string;
  title: string;
  artist: string;
  externalRef: string | null;
  durationSec: number | null;
  videos: DjVideo[];
  requestedBy: string;
  tableId: string | null;
  tableLabel: string | null;
  groupId: string | null;
  singers: string[];
  note: string | null;
  status: DjItemStatus;
  priority: number;
  /** Fractional rank; 0 while pending. */
  position: number;
  lockedByHost: boolean;
  createdAt: string;
  startedAt: string | null;
}

export interface DjHistoryItem {
  requestId: string;
  songId: string;
  title: string;
  artist: string;
  singers: string[];
  requestedBy: string;
  tableId: string | null;
  tableLabel: string | null;
  endedAt: string;
}

export interface DjNight {
  id: string;
  status: "open" | "closed";
  startedAt: string;
  closesAt: string | null;
}

export interface DjSnapshot {
  /** `demo` when Supabase is not configured: the night lives in memory on the server. */
  mode: "demo" | "live";
  /**
   * True when host actions are persisted server-side (live, or a demo night stored for this
   * browser). False for the seeded demo night a DJ sees without a guest cookie: actions then stay
   * in the browser and a refetch would wipe them.
   */
  persisted: boolean;
  venue: { id: string; name: string };
  night: DjNight | null;
  rules: QueueRulesConfig;
  /** Table labels by id, for rows whose table the venue has since renamed or removed. */
  tables: Record<string, string>;
  /** Pending, queued and now-singing requests of the open night, in storage order. */
  items: DjQueueItem[];
  /** Requests finished tonight (status `done`), newest last. */
  history: DjHistoryItem[];
  /** ISO 8601 time the snapshot was produced. */
  generatedAt: string;
}

export type HostAction =
  /** `entryId` is minted by the client so the optimistic entry and the persisted row share an id. */
  | { type: "approve"; requestId: string; entryId: string }
  | { type: "start"; entryId: string }
  | { type: "done"; entryId: string; startNext: boolean }
  | { type: "skip"; requestId: string }
  | { type: "pin"; entryId: string; locked: boolean }
  | { type: "priority"; requestId: string; priority: number }
  | { type: "move"; entryId: string; direction: "up" | "down" };

/** Field-level change produced by a host action; the server persists exactly these. */
export interface RequestChange {
  requestId: string;
  status?: "queued" | "now_singing" | "done" | "skipped";
  priority?: number;
}

export interface EntryChange {
  entryId: string;
  position?: number;
  lockedByHost?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface EntryInsert {
  /** Client-generated id so optimistic state and the persisted row agree. */
  entryId: string;
  requestId: string;
  position: number;
}

export interface HostActionResult {
  snapshot: DjSnapshot;
  requests: RequestChange[];
  entries: EntryChange[];
  inserts: EntryInsert[];
}
