import type { DjQueueItem } from "./types";

/**
 * Two-deck YouTube playback for the DJ console.
 *
 * One deck holds the song on the mic (or the next one cued while nobody sings). The other deck
 * preloads the song that takes the mic after it, so handing the mic over is a swap instead of a
 * fresh load. This module only plans which deck does what; `useYouTubeDecks` runs the plan
 * against the IFrame API. Pure, so the swap rules are unit-tested.
 */

export type DeckIndex = 0 | 1;

export interface DecksState {
  /** The deck the DJ hears and controls. */
  active: DeckIndex;
  /** Video each deck holds (cued, loading or warmed), or null when stopped. */
  held: [string | null, string | null];
}

export type DeckCommand =
  /** Load `videoId` on the active deck, paused at the start (no autoplay). */
  | { type: "cue"; deck: DeckIndex; videoId: string }
  /** The standby deck already holds the wanted video: it becomes the active deck. */
  | { type: "promote"; deck: DeckIndex }
  /** Load `videoId` muted on the standby deck and buffer its first seconds. */
  | { type: "preload"; deck: DeckIndex; videoId: string }
  | { type: "stop"; deck: DeckIndex };

export const INITIAL_DECKS: DecksState = { active: 0, held: [null, null] };

const other = (deck: DeckIndex): DeckIndex => (deck === 0 ? 1 : 0);

/**
 * Commands that bring the decks to `current` on the active deck and `next` on standby.
 * When the standby deck already holds `current` (the mic was handed over), the decks swap
 * and the old active deck is reused for the following song.
 */
export function planDecks(
  state: DecksState,
  want: { current: string | null; next: string | null },
): { state: DecksState; commands: DeckCommand[] } {
  const commands: DeckCommand[] = [];
  const held: [string | null, string | null] = [...state.held];
  let active = state.active;

  if (held[active] !== want.current) {
    const standby = other(active);
    if (want.current !== null && held[standby] === want.current) {
      active = standby;
      commands.push({ type: "promote", deck: active });
    } else if (want.current !== null) {
      held[active] = want.current;
      commands.push({ type: "cue", deck: active, videoId: want.current });
    } else {
      held[active] = null;
      commands.push({ type: "stop", deck: active });
    }
  }

  const standby = other(active);
  // The same video on both decks would play the song twice in a row; leave standby empty.
  const next = want.next !== want.current ? want.next : null;
  if (held[standby] !== next) {
    held[standby] = next;
    commands.push(
      next === null
        ? { type: "stop", deck: standby }
        : { type: "preload", deck: standby, videoId: next },
    );
  }

  return { state: { active, held }, commands };
}

/** The embeddable version the DJ picked for this song, else its first embeddable one. */
export function pickVideoId(
  item: DjQueueItem | null,
  chosen: Readonly<Record<string, string>>,
): string | null {
  if (!item) return null;
  const embeddable = item.videos.filter((v) => v.embeddable);
  const pick = chosen[item.songId];
  if (pick && embeddable.some((v) => v.youtubeId === pick)) return pick;
  return embeddable[0]?.youtubeId ?? null;
}
