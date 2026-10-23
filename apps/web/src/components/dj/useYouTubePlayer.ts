"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerStatus = "loading" | "idle" | "cued" | "playing" | "paused" | "ended" | "error";

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

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<typeof YT> | null = null;

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
 * Drive one YouTube player mounted in `containerRef`. Changing `videoId` cues the new video
 * (no autoplay: the DJ presses play when the singer is ready). `onEnded` fires once when a
 * video plays to the end so the console can offer "Done".
 */
export function useYouTubePlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  videoId: string | null,
  onEnded?: () => void,
): PlayerControls {
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMutedState] = useState(false);
  const [rate, setRateState] = useState(1);
  const pendingVideo = useRef<string | null>(videoId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    loadYouTubeApi().then((api) => {
      if (cancelled || playerRef.current) return;
      const host = document.createElement("div");
      container.replaceChildren(host);
      playerRef.current = new api.Player(host, {
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
            readyRef.current = true;
            target.setVolume(80);
            if (pendingVideo.current) {
              target.cueVideoById(pendingVideo.current);
              setStatus("cued");
            } else {
              setStatus("idle");
            }
          },
          onStateChange: ({ data, target }) => {
            const S = api.PlayerState;
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
          onError: () => setStatus("error"),
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    };
    // The container never changes identity; mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pendingVideo.current = videoId;
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (videoId) {
      player.cueVideoById(videoId);
      setStatus("cued");
    } else {
      player.stopVideo();
      setStatus("idle");
    }
    setCurrentTime(0);
    setDuration(0);
  }, [videoId]);

  useEffect(() => {
    if (status !== "playing") return;
    const handle = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime());
      const d = player.getDuration();
      if (d > 0) setDuration(d);
    }, 500);
    return () => clearInterval(handle);
  }, [status]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const restart = useCallback(() => {
    playerRef.current?.seekTo(0, true);
    playerRef.current?.playVideo();
  }, []);
  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setCurrentTime(seconds);
  }, []);
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    playerRef.current?.setVolume(clamped);
    setVolumeState(clamped);
  }, []);
  const setMuted = useCallback((m: boolean) => {
    if (m) playerRef.current?.mute();
    else playerRef.current?.unMute();
    setMutedState(m);
  }, []);
  const setRate = useCallback((r: number) => {
    playerRef.current?.setPlaybackRate(r);
    setRateState(r);
  }, []);

  return {
    status,
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
