// Pure: turns tonight's night snapshot plus seating rows into one row per table for the admin's
// "Tables tonight" board. No server-only imports, so the client and tests can use it.

import { orderedQueue } from "@/lib/dj/queue-model";
import type { DjSnapshot } from "@/lib/dj/types";
import { estimateStarts } from "@/lib/dj/wait";

export interface TonightGroup {
  id: string;
  table_id: string | null;
  created_at: string;
  is_active: boolean;
}

export interface TonightMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface TonightProfile {
  id: string;
  display_name: string | null;
}

export interface TableGuest {
  userId: string;
  /** The name the guest gave at first sign-in; null when unknown. */
  name: string | null;
  /** When they sat down at this table tonight; null when only inferred from requests. */
  joinedAt: string | null;
}

export interface TableSong {
  requestId: string;
  title: string;
  artist: string;
  singers: string[];
  note: string | null;
  status: "now_singing" | "queued" | "pending" | "done";
  /** 1-based place in "Up next" (queued only). */
  place: number | null;
  /** Requested at (waiting songs), started at (on the mic) or finished at (sung). */
  at: string;
  movedByHand: boolean;
  /** Estimated start (ISO) for queued songs, from the queue order and song lengths. */
  estimatedStartAt: string | null;
}

export interface TableBoardRow {
  /** Null for walk-up requests that have no table. */
  tableId: string | null;
  label: string | null;
  /** When the table's group was created tonight (first guest sat down). */
  openedAt: string | null;
  guests: TableGuest[];
  nowSinging: TableSong | null;
  /** Queued songs in queue order, then requests awaiting approval. */
  waiting: TableSong[];
  /** Finished tonight, most recent first. */
  sung: TableSong[];
}

export interface TableBoard {
  mode: DjSnapshot["mode"];
  persisted: boolean;
  nightId: string | null;
  nightStartedAt: string | null;
  rows: TableBoardRow[];
  totals: { openTables: number; guests: number; waiting: number; sung: number };
  generatedAt: string;
}

const byLabel = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function earliest(values: (string | null | undefined)[]): string | null {
  const present = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a <= b ? a : b));
}

/**
 * Build the board. `groups`, `members` and `profiles` come from the night's seating (live mode);
 * without them (demo night) guests and opening times are inferred from the requests.
 */
export function buildTableBoard(
  snapshot: DjSnapshot,
  seating: { groups: TonightGroup[]; members: TonightMember[]; profiles: TonightProfile[] } = {
    groups: [],
    members: [],
    profiles: [],
  },
): TableBoard {
  const open = snapshot.night?.status === "open";
  const queued = open ? orderedQueue(snapshot).filter((i) => i.status === "queued") : [];
  const placeOf = new Map(queued.map((item, index) => [item.requestId, index + 1] as const));
  const starts = open ? estimateStarts(snapshot, snapshot.generatedAt) : new Map<string, number>();
  const nameOf = new Map(seating.profiles.map((p) => [p.id, p.display_name] as const));
  const items = open ? snapshot.items : [];
  const history = open ? snapshot.history : [];

  const tableIds = new Set<string>(Object.keys(snapshot.tables));
  for (const i of items) if (i.tableId) tableIds.add(i.tableId);
  for (const h of history) if (h.tableId) tableIds.add(h.tableId);
  const hasWalkUps = items.some((i) => !i.tableId) || history.some((h) => !h.tableId);

  const rowFor = (tableId: string | null): TableBoardRow => {
    const tableItems = items.filter((i) => i.tableId === tableId);
    const tableHistory = history.filter((h) => h.tableId === tableId);
    const groups = tableId
      ? seating.groups.filter((g) => g.table_id === tableId && g.is_active)
      : [];
    const groupIds = new Set(groups.map((g) => g.id));

    let guests: TableGuest[] = seating.members
      .filter((m) => groupIds.has(m.group_id))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((m) => ({
        userId: m.user_id,
        name: nameOf.get(m.user_id) ?? null,
        joinedAt: m.joined_at,
      }));
    if (seating.groups.length === 0) {
      // Demo night (no seating rows): whoever requested from this table sat there.
      // One entry per user and per name (the same singer can appear under several ids).
      const seen = new Map<string, TableGuest>();
      const names = new Set<string>();
      for (const r of [...tableItems, ...tableHistory]) {
        const name = r.singers[0] ?? "";
        if (name && names.has(name)) continue;
        names.add(name);
        if (!seen.has(r.requestedBy)) {
          seen.set(r.requestedBy, {
            userId: r.requestedBy,
            name: r.singers[0] ?? null,
            joinedAt: null,
          });
        }
      }
      guests = [...seen.values()];
    }

    const toSong = (
      i: (typeof tableItems)[number],
      status: TableSong["status"],
      at: string,
    ): TableSong => ({
      requestId: i.requestId,
      title: i.title,
      artist: i.artist,
      singers: i.singers,
      note: i.note,
      status,
      place: status === "queued" ? (placeOf.get(i.requestId) ?? null) : null,
      at,
      movedByHand: i.lockedByHost,
      estimatedStartAt:
        status === "queued" && starts.has(i.requestId)
          ? new Date(starts.get(i.requestId)!).toISOString()
          : null,
    });

    const singing = tableItems.find((i) => i.status === "now_singing");
    const waitingQueued = tableItems
      .filter((i) => i.status === "queued")
      .map((i) => toSong(i, "queued", i.createdAt))
      .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity));
    const waitingPending = tableItems
      .filter((i) => i.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => toSong(i, "pending", i.createdAt));
    const sung: TableSong[] = tableHistory
      .map((h) => ({
        requestId: h.requestId,
        title: h.title,
        artist: h.artist,
        singers: h.singers,
        note: null,
        status: "done" as const,
        place: null,
        at: h.endedAt,
        movedByHand: false,
        estimatedStartAt: null,
      }))
      .sort((a, b) => b.at.localeCompare(a.at));

    const openedAt =
      earliest(groups.map((g) => g.created_at)) ??
      earliest([
        ...guests.map((g) => g.joinedAt),
        ...tableItems.map((i) => i.createdAt),
        ...tableHistory.map((h) => h.endedAt),
      ]);

    return {
      tableId,
      label: tableId ? (snapshot.tables[tableId] ?? null) : null,
      openedAt,
      guests,
      nowSinging: singing
        ? toSong(singing, "now_singing", singing.startedAt ?? singing.createdAt)
        : null,
      waiting: [...waitingQueued, ...waitingPending],
      sung,
    };
  };

  const rows = [...tableIds]
    .map((id) => rowFor(id))
    .sort((a, b) => byLabel.compare(a.label ?? "", b.label ?? ""));
  if (hasWalkUps) rows.push(rowFor(null));

  return {
    mode: snapshot.mode,
    persisted: snapshot.persisted,
    nightId: open ? (snapshot.night?.id ?? null) : null,
    nightStartedAt: open ? (snapshot.night?.startedAt ?? null) : null,
    rows,
    totals: {
      openTables: rows.filter((r) => r.tableId && r.openedAt).length,
      guests: rows.reduce((n, r) => n + r.guests.length, 0),
      waiting: rows.reduce((n, r) => n + r.waiting.length, 0),
      sung: rows.reduce((n, r) => n + r.sung.length, 0),
    },
    generatedAt: snapshot.generatedAt,
  };
}
