"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicError = "denied" | "unsupported" | null;

export interface MicChannel {
  enabled: boolean;
  error: MicError;
  gain: number;
  muted: boolean;
  echo: boolean;
  echoAmount: number;
  /** 0..1 RMS level of the processed signal, updated ~30 times per second. */
  level: number;
  enable: () => Promise<void>;
  disable: () => void;
  setGain: (gain: number) => void;
  setMuted: (muted: boolean) => void;
  setEcho: (echo: boolean) => void;
  setEchoAmount: (amount: number) => void;
}

interface Graph {
  context: AudioContext;
  stream: MediaStream;
  input: GainNode;
  dry: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wet: GainNode;
  master: GainNode;
  analyser: AnalyserNode;
}

/**
 * Microphone channel built on Web Audio: mic -> gain -> (dry + echo) -> master -> speakers.
 * The browser can only reach the default output device, so this is a backup / monitoring
 * path; the venue's hardware mixer stays in charge of the PA.
 */
export function useMicChannel(): MicChannel {
  const graphRef = useRef<Graph | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<MicError>(null);
  const [gain, setGainState] = useState(0.8);
  const [muted, setMutedState] = useState(false);
  const [echo, setEchoState] = useState(false);
  const [echoAmount, setEchoAmountState] = useState(0.3);
  const [level, setLevel] = useState(0);

  const applyLevels = useCallback(
    (g: Graph, next: { gain: number; muted: boolean; echo: boolean; echoAmount: number }) => {
      const t = g.context.currentTime;
      g.input.gain.setTargetAtTime(next.muted ? 0 : next.gain, t, 0.02);
      g.wet.gain.setTargetAtTime(next.echo ? next.echoAmount : 0, t, 0.05);
      g.feedback.gain.setTargetAtTime(
        next.echo ? Math.min(0.6, next.echoAmount * 0.8) : 0,
        t,
        0.05,
      );
    },
    [],
  );

  const disable = useCallback(() => {
    const g = graphRef.current;
    graphRef.current = null;
    if (g) {
      for (const track of g.stream.getTracks()) track.stop();
      void g.context.close();
    }
    setEnabled(false);
    setLevel(0);
  }, []);

  const enable = useCallback(async () => {
    if (graphRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      const context = new AudioContext({ latencyHint: "interactive" });
      const source = context.createMediaStreamSource(stream);
      const input = context.createGain();
      const dry = context.createGain();
      const delay = context.createDelay(1);
      const feedback = context.createGain();
      const wet = context.createGain();
      const master = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      delay.delayTime.value = 0.28;

      source.connect(input);
      input.connect(dry);
      dry.connect(master);
      input.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(master);
      master.connect(analyser);
      analyser.connect(context.destination);

      const g: Graph = { context, stream, input, dry, delay, feedback, wet, master, analyser };
      graphRef.current = g;
      applyLevels(g, { gain, muted, echo, echoAmount });
      setError(null);
      setEnabled(true);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }, [applyLevels, echo, echoAmount, gain, muted]);

  useEffect(() => {
    const g = graphRef.current;
    if (g) applyLevels(g, { gain, muted, echo, echoAmount });
  }, [applyLevels, echo, echoAmount, gain, muted]);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const buffer = new Float32Array(1024);
    const tick = () => {
      const g = graphRef.current;
      if (g) {
        g.analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = buffer[i] ?? 0;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 3));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  useEffect(() => disable, [disable]);

  return {
    enabled,
    error,
    gain,
    muted,
    echo,
    echoAmount,
    level,
    enable,
    disable,
    setGain: setGainState,
    setMuted: setMutedState,
    setEcho: setEchoState,
    setEchoAmount: setEchoAmountState,
  };
}
