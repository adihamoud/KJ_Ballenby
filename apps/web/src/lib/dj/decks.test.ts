import { INITIAL_DECKS, pickVideoId, planDecks } from "./decks";
import type { DecksState } from "./decks";
import type { DjQueueItem } from "./types";

const A = "aaaaaaaaaaa";
const B = "bbbbbbbbbbb";
const C = "ccccccccccc";

function run(state: DecksState, current: string | null, next: string | null) {
  return planDecks(state, { current, next });
}

describe("planDecks", () => {
  it("cues the current song and preloads the next one on the other deck", () => {
    const { state, commands } = run(INITIAL_DECKS, A, B);
    expect(commands).toEqual([
      { type: "cue", deck: 0, videoId: A },
      { type: "preload", deck: 1, videoId: B },
    ]);
    expect(state).toEqual({ active: 0, held: [A, B] });
  });

  it("does nothing when the decks already hold what is wanted", () => {
    const first = run(INITIAL_DECKS, A, B).state;
    expect(run(first, A, B)).toEqual({ state: first, commands: [] });
  });

  it("swaps decks when the preloaded song takes the mic and reuses the old deck", () => {
    const first = run(INITIAL_DECKS, A, B).state;
    const { state, commands } = run(first, B, C);
    expect(commands).toEqual([
      { type: "promote", deck: 1 },
      { type: "preload", deck: 0, videoId: C },
    ]);
    expect(state).toEqual({ active: 1, held: [C, B] });
  });

  it("swaps back and forth across several turns", () => {
    let state = run(INITIAL_DECKS, A, B).state;
    state = run(state, B, C).state;
    const res = run(state, C, A);
    expect(res.commands).toEqual([
      { type: "promote", deck: 0 },
      { type: "preload", deck: 1, videoId: A },
    ]);
    expect(res.state).toEqual({ active: 0, held: [C, A] });
  });

  it("re-preloads when the queue changes who is next", () => {
    const first = run(INITIAL_DECKS, A, B).state;
    expect(run(first, A, C).commands).toEqual([{ type: "preload", deck: 1, videoId: C }]);
  });

  it("cues on the active deck when the DJ jumps to a song that was not preloaded", () => {
    const first = run(INITIAL_DECKS, A, B).state;
    const { state, commands } = run(first, C, B);
    expect(commands).toEqual([{ type: "cue", deck: 0, videoId: C }]);
    expect(state).toEqual({ active: 0, held: [C, B] });
  });

  it("leaves standby empty when the next song is the same video", () => {
    const { state, commands } = run(INITIAL_DECKS, A, A);
    expect(commands).toEqual([{ type: "cue", deck: 0, videoId: A }]);
    expect(state.held).toEqual([A, null]);
  });

  it("stops decks that have nothing to hold", () => {
    const first = run(INITIAL_DECKS, A, B).state;
    expect(run(first, A, null).commands).toEqual([{ type: "stop", deck: 1 }]);
    expect(run(first, null, null).commands).toEqual([
      { type: "stop", deck: 0 },
      { type: "stop", deck: 1 },
    ]);
  });
});

describe("pickVideoId", () => {
  const item = {
    songId: "song-1",
    videos: [
      { youtubeId: A, label: null, durationSec: null, embeddable: false },
      { youtubeId: B, label: null, durationSec: null, embeddable: true },
      { youtubeId: C, label: null, durationSec: null, embeddable: true },
    ],
  } as DjQueueItem;

  it("defaults to the first embeddable version", () => {
    expect(pickVideoId(item, {})).toBe(B);
  });

  it("keeps the DJ's choice when it is embeddable", () => {
    expect(pickVideoId(item, { "song-1": C })).toBe(C);
    expect(pickVideoId(item, { "song-1": A })).toBe(B);
  });

  it("is null without an item or an embeddable version", () => {
    expect(pickVideoId(null, {})).toBeNull();
    expect(pickVideoId({ ...item, videos: [] }, {})).toBeNull();
  });
});
