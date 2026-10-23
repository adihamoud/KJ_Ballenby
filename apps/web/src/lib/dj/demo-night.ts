import { DEFAULT_RULES, reorder } from "@kj/queue-engine";
import { DEMO_CATALOG } from "@/lib/guest/demo-catalog";
import { toNightState } from "./queue-model";
import type { DjHistoryItem, DjQueueItem, DjSnapshot, DjVideo } from "./types";

/**
 * A believable mid-evening night for the demo venue, served when Supabase is not
 * configured so the DJ console can be exercised (and e2e-tested) without a database.
 * Actions are applied in the browser only.
 */

const TABLES = [
  { id: "demo-table-1", label: "T1" },
  { id: "demo-table-2", label: "T2" },
  { id: "demo-table-3", label: "T3" },
  { id: "demo-table-bar", label: "Bar" },
] as const;

type TableIndex = 0 | 1 | 2 | 3;

interface Seed {
  song: string;
  table: TableIndex;
  singers: string[];
  minutesAgo: number;
  status: DjQueueItem["status"];
  priority?: number;
  locked?: boolean;
  note?: string;
}

const SEEDS: Seed[] = [
  { song: "Sweet Caroline", table: 1, singers: ["נועה"], minutesAgo: 14, status: "now_singing" },
  { song: "הללויה", table: 0, singers: ["דנה", "יוסי"], minutesAgo: 12, status: "queued" },
  { song: "Shallow", table: 2, singers: ["ליאור", "מאיה"], minutesAgo: 11, status: "queued" },
  { song: "תודה", table: 3, singers: ["Tom"], minutesAgo: 9, status: "queued", priority: 1 },
  { song: "Dancing Queen", table: 0, singers: ["אבי"], minutesAgo: 7, status: "queued" },
  { song: "Toy", table: 1, singers: ["שירה"], minutesAgo: 5, status: "queued", locked: true },
  { song: "Wonderwall", table: 2, singers: ["Dan"], minutesAgo: 3, status: "pending" },
  {
    song: "דיווה",
    table: 3,
    singers: ["רוני"],
    minutesAgo: 1,
    status: "pending",
    note: "יום הולדת!",
  },
];

const HISTORY: Array<{ song: string; table: TableIndex; singers: string[]; minutesAgo: number }> = [
  { song: "Bohemian Rhapsody", table: 0, singers: ["דנה"], minutesAgo: 22 },
  { song: "אבניבי", table: 2, singers: ["ליאור"], minutesAgo: 17 },
];

function findSong(title: string) {
  const song = DEMO_CATALOG.find((s) => s.title === title);
  if (!song) throw new Error(`demo night: unknown song ${title}`);
  return song;
}

function videosOf(title: string): DjVideo[] {
  return findSong(title).videos.map((v) => ({
    youtubeId: v.youtube_id,
    label: v.label,
    durationSec: v.duration_sec,
    embeddable: v.embeddable,
  }));
}

function minutesBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function demoSnapshot(now: Date = new Date()): DjSnapshot {
  let position = 0;
  const items: DjQueueItem[] = SEEDS.map((seed, index) => {
    const song = findSong(seed.song);
    const table = TABLES[seed.table];
    const hasEntry = seed.status !== "pending";
    if (hasEntry) position += 1000;
    return {
      requestId: `demo-request-${index + 1}`,
      entryId: hasEntry ? `demo-entry-${index + 1}` : null,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      externalRef: null,
      durationSec: song.duration_sec,
      videos: videosOf(seed.song),
      requestedBy: `demo-user-${index + 1}`,
      tableId: table.id,
      tableLabel: table.label,
      groupId: null,
      singers: seed.singers,
      note: seed.note ?? null,
      status: seed.status,
      priority: seed.priority ?? 0,
      position: hasEntry ? position : 0,
      lockedByHost: seed.locked ?? false,
      createdAt: minutesBefore(now, seed.minutesAgo),
      startedAt: seed.status === "now_singing" ? minutesBefore(now, 2) : null,
    };
  });

  const history: DjHistoryItem[] = HISTORY.map((h, index) => {
    const song = findSong(h.song);
    const table = TABLES[h.table];
    return {
      requestId: `demo-history-${index + 1}`,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      singers: h.singers,
      requestedBy: `demo-history-user-${index + 1}`,
      tableId: table.id,
      tableLabel: table.label,
      endedAt: minutesBefore(now, h.minutesAgo),
    };
  });

  const snapshot: DjSnapshot = {
    mode: "demo",
    venue: { id: "00000000-0000-0000-0000-000000000001", name: "Demo Karaoke Bar" },
    night: {
      id: "demo-night",
      status: "open",
      startedAt: minutesBefore(now, 95),
      closesAt: null,
    },
    rules: { ...DEFAULT_RULES, requireHostApproval: true },
    items,
    history,
    generatedAt: now.toISOString(),
  };
  // Stored positions follow engine order, as the server guarantees after every host action.
  const renumbered = new Map(
    reorder(snapshot.rules, toNightState(snapshot, snapshot.generatedAt)).map((c) => [
      c.id,
      c.position,
    ]),
  );
  return {
    ...snapshot,
    items: items.map((i) => {
      const position = i.entryId ? renumbered.get(i.entryId) : undefined;
      return position === undefined ? i : { ...i, position };
    }),
  };
}
