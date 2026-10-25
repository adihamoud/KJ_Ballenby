"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_DECKS, planDecks } from "@/lib/dj/decks";
import type { DeckCommand, DeckIndex, DecksState } from "@/lib/dj/decks";

export type PlayerStatus = "loading" | "idle" | "cued" | "playing" | "paused" | "ended" | "error";

/** The standby deck: nothing to preload, loading the next song, buffered and ready, or failed. */
export type DeckStatus = "idle" | "loading" | "ready" | "error";

export interface PlayerControls {
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setRate: (rate: number) => void;
}

export interface DeckControls extends PlayerControls {
  /** Which container holds the deck the DJ hears; the other one preloads the next song. */
  activeDeck: DeckIndex;
  deckStatus: DeckStatus;
}

type DeckRefs = readonly [
  React.RefObject<HTMLDivElement | null>,
  React.RefObject<HTMLDivElement | null>,
];

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<typeof YT> | null = null;

/** Give up waiting for a warm-up that never starts playing (blocked autoplay, a long ad). */
const WARM_TIMEOUT_MS = 20_000;

/** Load the IFrame API script once per page and resolve when `window.YT` is usable. */
function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
  return apiPromise;
}

/**
 * Drive two YouTube players, one per container in `containers` (see `lib/dj/decks.ts`).
 * The active deck cues `videos.current` (no autoplay: the DJ presses play when the singer is
 * ready). The standby deck loads `videos.next` muted, plays it until the first frame so its
 * opening seconds are buffered, then pauses at 0:00. When `current` becomes the preloaded
 * video the decks swap, so the next singer's video is ready the moment the mic is handed over.
 * `onEnded` fires once when the active video plays to the end so the console can offer "Done".
 */
export function useYouTubePlayer(
  containers: DeckRefs,
  videos: { current: string | null; next: string | null },
  { enabled = true, onEnded }: { enabled?: boolean; onEnded?: () => void } = {},
): DeckControls {
  const playersRef = useRef<[YT.Player | null, YT.Player | null]>([null, null]);
  const readyRef = useRef<[boolean, boolean]>([false, false]);
  const decksRef = useRef<DecksState>(INITIAL_DECKS);
  const warmTimers = useRef<[number | null, number | null]>([null, null]);
  const wantRef = useRef(videos);
  wantRef.current = videos;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const audioRef = useRef({ volume: 80, muted: false, rate: 1 });

  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [deckStatus, setDeckStatus] = useState<DeckStatus>("idle");
  const [activeDeck, setActiveDeck] = useState<DeckIndex>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMutedState] = useState(false);
  const [rate, setRateState] = useState(1);

  const active = useCallback(() => playersRef.current[decksRef.current.active], []);

  const endWarm = useCallback((deck: DeckIndex) => {
    const timer = warmTimers.current[deck];
    if (timer !== null) window.clearTimeout(timer);
    warmTimers.current[deck] = null;
  }, []);

  const applyAudio = useCallback((player: YT.Player) => {
    const audio = audioRef.current;
    player.setVolume(audio.volume);
    if (audio.muted) player.mute();
    else player.unMute();
    player.setPlaybackRate(audio.rate);
  }, []);

  const run = useCallback(
    (command: DeckCommand) => {
      const player = playersRef.current[command.deck];
      if (!player) return;
      const warming = warmTimers.current[command.deck] !== null;
      endWarm(command.deck);
      switch (command.type) {
        case "cue":
          player.cueVideoById(command.videoId);
          applyAudio(player);
          setStatus("cued");
          setCurrentTime(0);
          setDuration(0);
          break;
        case "promote": {
          // The old active deck goes quiet before the swap, whatever standby does with it next.
          const previous = playersRef.current[command.deck === 0 ? 1 : 0];
          previous?.pauseVideo();
          previous?.mute();
          const videoId = decksRef.current.held[command.deck];
          if (!warming && player.getPlayerState() === YT.PlayerState.PAUSED) {
            // Warmed up and paused: seeking keeps it paused, with the buffer intact.
            player.seekTo(0, true);
            player.pauseVideo();
          } else if (videoId) {
            // Still loading (or autoplay was blocked): re-cue so it cannot start on its own.
            player.cueVideoById(videoId);
          }
          applyAudio(player);
          setActiveDeck(command.deck);
          setStatus("cued");
          setCurrentTime(0);
          setDuration(player.getDuration() || 0);
          break;
        }
        case "preload":
          player.mute();
          player.loadVideoById(command.videoId);
          setDeckStatus("loading");
          warmTimers.current[command.deck] = window.setTimeout(() => {
            warmTimers.current[command.deck] = null;
            player.pauseVideo();
            setDeckStatus("ready");
          }, WARM_TIMEOUT_MS);
          break;
        case "stop":
          player.stopVideo();
          if (command.deck === decksRef.current.active) {
            setStatus("idle");
            setCurrentTime(0);
            setDuration(0);
          } else {
            setDeckStatus("idle");
          }
          break;
      }
    },
    [applyAudio, endWarm],
  );

  const sync = useCallback(() => {
    if (!readyRef.current[0] || !readyRef.current[1]) return;
    const plan = planDecks(decksRef.current, wantRef.current);
    decksRef.current = plan.state;
    plan.commands.forEach(run);
  }, [run]);

  // (Re)create both players whenever the panel that owns the containers is mounted. The panel
  // only exists while a night is open, so a console that opens the night from inside the page
  // (or sees it closed and reopened) gets fresh players instead of containers that stay empty.
  useEffect(() => {
    if (!enabled) return;
    const hosts = [containers[0].current, containers[1].current] as const;
    if (!hosts[0] || !hosts[1]) return;
    let cancelled = false;
    setStatus("loading");
    loadYouTubeApi().then((api) => {
      if (cancelled || playersRef.current[0]) return;
      ([0, 1] as const).forEach((deck) => {
        const container = hosts[deck];
        if (!container) return;
        const host = document.createElement("div");
        container.replaceChildren(host);
        playersRef.current[deck] = new api.Player(host, {
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            origin: location.origin,
          },
          events: {
            onReady: ({ target }) => {
              readyRef.current[deck] = true;
              target.setVolume(audioRef.current.volume);
              if (readyRef.current[0] && readyRef.current[1]) {
                setStatus("idle");
                setDeckStatus("idle");
                sync();
              }
            },
            onStateChange: ({ data, target }) => {
              const S = api.PlayerState;
              if (deck !== decksRef.current.active) {
                // Standby: the first frame means the opening seconds are buffered.
                if (data === S.PLAYING && warmTimers.current[deck] !== null) {
                  endWarm(deck);
                  // Seek first: seeking a playing video keeps it playing, then pause at 0:00.
                  target.seekTo(0, true);
                  target.pauseVideo();
                  setDeckStatus("ready");
                }
                return;
              }
              if (data === S.PLAYING) {
                setStatus("playing");
                setDuration(target.getDuration());
              } else if (data === S.PAUSED) setStatus("paused");
              else if (data === S.CUED) {
                setStatus("cued");
                setCurrentTime(0);
                setDuration(target.getDuration());
              } else if (data === S.ENDED) {
                setStatus("ended");
                onEndedRef.current?.();
              }
            },
            onError: () => {
              if (deck === decksRef.current.active) setStatus("error");
              else {
                endWarm(deck);
                setDeckStatus("error");
              }
            },
          },
        });
      });
    });
    return () => {
      cancelled = true;
      ([0, 1] as const).forEach((deck) => {
        endWarm(deck);
        playersRef.current[deck]?.destroy();
      });
      playersRef.current = [null, null];
      readyRef.current = [false, false];
      decksRef.current = INITIAL_DECKS;
      setActiveDeck(0);
      setStatus("loading");
      setDeckStatus("idle");
      setCurrentTime(0);
      setDuration(0);
    };
    // The containers' identity follows `enabled` (the panel mounts with the open night).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const { current: currentVideo, next: nextVideo } = videos;
  useEffect(() => {
    sync();
  }, [currentVideo, nextVideo, sync]);

  useEffect(() => {
    if (status !== "playing") return;
    const handle = setInterval(() => {
      const player = active();
      if (!player) return;
      setCurrentTime(player.getCurrentTime());
      const d = player.getDuration();
      if (d > 0) setDuration(d);
    }, 500);
    return () => clearInterval(handle);
  }, [status, active]);

  const play = useCallback(() => active()?.playVideo(), [active]);
  const pause = useCallback(() => active()?.pauseVideo(), [active]);
  const restart = useCallback(() => {
    active()?.seekTo(0, true);
    active()?.playVideo();
  }, [active]);
  const seek = useCallback(
    (seconds: number) => {
      active()?.seekTo(seconds, true);
      setCurrentTime(seconds);
    },
    [active],
  );
  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(v)));
      audioRef.current.volume = clamped;
      active()?.setVolume(clamped);
      setVolumeState(clamped);
    },
    [active],
  );
  const setMuted = useCallback(
    (m: boolean) => {
      audioRef.current.muted = m;
      if (m) active()?.mute();
      else active()?.unMute();
      setMutedState(m);
    },
    [active],
  );
  const setRate = useCallback(
    (r: number) => {
      audioRef.current.rate = r;
      active()?.setPlaybackRate(r);
      setRateState(r);
    },
    [active],
  );

  return {
    status,
    deckStatus,
    activeDeck,
    currentTime,
    duration,
    volume,
    muted,
    rate,
    play,
    pause,
    restart,
    seek,
    setVolume,
    setMuted,
    setRate,
  };
}
