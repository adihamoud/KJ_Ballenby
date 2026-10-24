"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MicChannel } from "./useMicChannel";
import type { PlayerControls } from "./useYouTubePlayer";

interface MixerPanelProps {
  player: PlayerControls;
  mic: MicChannel;
  masterMuted: boolean;
  onMasterMuted: (muted: boolean) => void;
}

const TEMPOS = [0.75, 0.9, 1, 1.1, 1.25] as const;
const FADE_MS = 3000;

export function MixerPanel({ player, mic, masterMuted, onMasterMuted }: MixerPanelProps) {
  const t = useTranslations("dj.mixer");
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearInterval(fadeTimer.current);
    },
    [],
  );

  const fadeOut = () => {
    if (fading || player.status !== "playing") return;
    const startVolume = player.volume;
    const steps = 30;
    let step = 0;
    setFading(true);
    fadeTimer.current = setInterval(() => {
      step += 1;
      player.setVolume(startVolume * (1 - step / steps));
      if (step >= steps) {
        if (fadeTimer.current) clearInterval(fadeTimer.current);
        fadeTimer.current = null;
        player.pause();
        player.setVolume(startVolume);
        setFading(false);
      }
    }, FADE_MS / steps);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="mixer-panel">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Music channel: the YouTube player. */}
        <Strip title={t("music")} muted={player.muted || masterMuted}>
          <Slider
            label={t("volume")}
            value={player.volume}
            min={0}
            max={100}
            step={1}
            display={`${player.volume}`}
            onChange={player.setVolume}
          />
          <div className="flex flex-col gap-1">
            <span className="text-muted text-xs">{t("tempo")}</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t("tempo")}>
              {TEMPOS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  aria-pressed={player.rate === rate}
                  onClick={() => player.setRate(rate)}
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                    player.rate === rate
                      ? "border-brand-2 bg-brand-2/20 text-text"
                      : "border-border bg-surface-2 text-muted"
                  }`}
                >
                  {rate === 1 ? "1×" : `${rate}×`}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto flex gap-2">
            <MuteButton
              muted={player.muted}
              onToggle={() => player.setMuted(!player.muted)}
              muteLabel={t("mute")}
              unmuteLabel={t("unmute")}
            />
            <button
              type="button"
              className="btn btn-secondary min-h-10 flex-1 text-sm"
              disabled={fading || player.status !== "playing"}
              onClick={fadeOut}
            >
              {fading ? t("fading") : t("fadeOut")}
            </button>
          </div>
        </Strip>

        {/* Mic channel: Web Audio from the browser's microphone. */}
        <Strip title={t("mic")} muted={mic.muted || masterMuted} active={mic.enabled}>
          <Meter level={mic.enabled ? mic.level : 0} label={t("level")} />
          <Slider
            label={t("gain")}
            value={Math.round(mic.gain * 100)}
            min={0}
            max={150}
            step={1}
            display={`${Math.round(mic.gain * 100)}%`}
            disabled={!mic.enabled}
            onChange={(v) => mic.setGain(v / 100)}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="text-muted flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-brand size-4"
                checked={mic.echo}
                disabled={!mic.enabled}
                onChange={(e) => mic.setEcho(e.target.checked)}
              />
              {t("echo")}
            </label>
          </div>
          <Slider
            label={t("echoAmount")}
            value={Math.round(mic.echoAmount * 100)}
            min={0}
            max={70}
            step={1}
            display={`${Math.round(mic.echoAmount * 100)}%`}
            disabled={!mic.enabled || !mic.echo}
            onChange={(v) => mic.setEchoAmount(v / 100)}
          />
          {mic.error && (
            <p role="alert" className="text-danger text-xs">
              {mic.error === "denied" ? t("micDenied") : t("micUnsupported")}
            </p>
          )}
          <div className="mt-auto flex gap-2">
            <MuteButton
              muted={mic.muted}
              disabled={!mic.enabled}
              onToggle={() => mic.setMuted(!mic.muted)}
              muteLabel={t("mute")}
              unmuteLabel={t("unmute")}
            />
            <button
              type="button"
              className={`btn min-h-10 flex-1 text-sm ${mic.enabled ? "btn-secondary" : "btn-primary"}`}
              onClick={() => (mic.enabled ? mic.disable() : void mic.enable())}
            >
              {mic.enabled ? t("disableMic") : t("enableMic")}
            </button>
          </div>
          <p className="text-muted text-xs">{t("micHint")}</p>
        </Strip>

        {/* Master: one switch that silences everything. */}
        <Strip title={t("master")} muted={masterMuted}>
          <button
            type="button"
            aria-pressed={masterMuted}
            onClick={() => onMasterMuted(!masterMuted)}
            className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
              masterMuted
                ? "border-danger bg-danger/20 text-text"
                : "border-border bg-surface-2 text-muted hover:text-text"
            }`}
          >
            <SpeakerIcon muted={masterMuted} />
            {masterMuted ? t("masterUnmute") : t("masterMute")}
          </button>
          <p className="text-muted text-xs">{t("masterHint")}</p>
        </Strip>
      </div>
    </div>
  );
}

function Strip({
  title,
  muted,
  active = false,
  children,
}: {
  title: string;
  muted: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`card flex flex-col gap-3 p-3 ${muted ? "opacity-70" : ""} ${active ? "border-brand/50" : ""}`}
      aria-label={title}
    >
      <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted flex justify-between text-xs">
        {label}
        <span className="tabular-nums">{display}</span>
      </span>
      <input
        type="range"
        className="accent-brand w-full"
        dir="ltr"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Meter({ level, label }: { level: number; label: string }) {
  const pct = Math.round(level * 100);
  const tone = level > 0.85 ? "bg-danger" : level > 0.6 ? "bg-accent" : "bg-brand";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="bg-surface-2 h-2 w-full overflow-hidden rounded-full"
      dir="ltr"
    >
      <div
        className={`h-full transition-[width] duration-75 ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MuteButton({
  muted,
  disabled = false,
  onToggle,
  muteLabel,
  unmuteLabel,
}: {
  muted: boolean;
  disabled?: boolean;
  onToggle: () => void;
  muteLabel: string;
  unmuteLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? unmuteLabel : muteLabel}
      title={muted ? unmuteLabel : muteLabel}
      disabled={disabled}
      onClick={onToggle}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full border disabled:opacity-40 ${
        muted ? "border-danger bg-danger/20 text-text" : "border-border bg-surface-2 text-muted"
      }`}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {muted ? (
        <path d="m22 9-6 6M16 9l6 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      )}
    </svg>
  );
}
