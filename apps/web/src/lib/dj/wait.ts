// Pure: when each waiting song is likely to start. Presentation only (it reads the engine's order,
// it never changes it), shared by the DJ console's table cards and the admin tables board.

import { nowSinging, orderedQueue } from "./queue-model";
import type { DjQueueItem, DjSnapshot } from "./types";

/** Used when a song has no known duration (karaoke tracks run about four minutes). */
export const DEFAULT_SONG_SEC = 240;
/** Handing the mic over, finding the track, a few words from the DJ. */
export const CHANGEOVER_SEC = 30;

function durationOf(item: Pick<DjQueueItem, "durationSec" | "videos">): number {
  const video = item.videos.find((v) => v.durationSec && v.durationSec > 0);
  return item.durationSec && item.durationSec > 0
    ? item.durationSec
    : (video?.durationSec ?? DEFAULT_SONG_SEC);
}

/**
 * Estimated start time (epoch ms) of every queued song, by request id, in queue order: what is
 * left of the song on the mic, then each song ahead plus a changeover. Empty when no night is open.
 */
export function estimateStarts(snapshot: DjSnapshot, now: string): Map<string, number> {
  const starts = new Map<string, number>();
  if (snapshot.night?.status !== "open") return starts;
  const nowMs = Date.parse(now);
  let cursor = nowMs;

  const singing = nowSinging(snapshot);
  if (singing) {
    const startedMs = singing.startedAt ? Date.parse(singing.startedAt) : nowMs;
    const endMs = startedMs + durationOf(singing) * 1000;
    // A song running past its length is "about to end", not finished: keep one changeover.
    cursor = Math.max(endMs, nowMs) + CHANGEOVER_SEC * 1000;
  }

  for (const item of orderedQueue(snapshot, now)) {
    if (item.status !== "queued") continue;
    starts.set(item.requestId, cursor);
    cursor += (durationOf(item) + CHANGEOVER_SEC) * 1000;
  }
  return starts;
}
