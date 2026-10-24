"use client";

import { useTranslations } from "next-intl";
import type { DjQueueItem } from "@/lib/dj/types";
import { formatDuration, youtubeWatchUrl } from "@/lib/youtube";
import type { PlayerControls } from "./useYouTubePlayer";

interface PlayerPanelProps {
  /** The song on the mic, or the next one cued when nobody is singing. */
  item: DjQueueItem | null;
  isSinging: boolean;
  selectedVideoId: string | null;
  onSelectVideo: (youtubeId: string) => void;
  player: PlayerControls;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onDone: () => void;
  autoStart: boolean;
}

export function PlayerPanel({
  item,
  isSinging,
  selectedVideoId,
  onSelectVideo,
  player,
  containerRef,
  onStart,
  onDone,
  autoStart,
}: PlayerPanelProps) {
  const t = useTranslations("dj.player");
  const hasVideo = selectedVideoId !== null;
  const canPlay = hasVideo && player.status !== "loading" && player.status !== "error";

  return (
    <div className="flex flex-col gap-3" data-testid="player-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            player.status === "playing"
              ? "border-brand bg-brand/20 text-text"
              : "border-border bg-surface-2 text-muted"
          }`}
          aria-live="polite"
        >
          {t(`status.${player.status}`)}
        </span>
      </div>

      {item ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">
            {isSinging ? t("onMic") : t("nextUp")}
          </p>
          <p className="truncate text-xl font-bold" dir="auto">
            {item.title}
            <span className="text-muted font-normal"> · {item.artist}</span>
          </p>
          <p className="text-muted truncate text-sm">
            <span dir="auto">{item.singers.join(" + ")}</span>
            {item.tableLabel && <span className="ms-2">· {item.tableLabel}</span>}
          </p>
        </div>
      ) : (
        <div>
          <p className="font-medium">{t("empty")}</p>
          <p className="text-muted text-sm">{t("emptyHint")}</p>
        </div>
      )}

      <div className="bg-surface-2 border-border relative aspect-video w-full overflow-hidden rounded-xl border">
        {/* The YouTube iframe mounts here once and stays mounted across songs and tabs. */}
        <div ref={containerRef} className="absolute inset-0 [&>iframe]:size-full" dir="ltr" />
        {!hasVideo && (
          <div className="text-muted absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            {item ? (item.videos.length > 0 ? t("noEmbeddable") : t("noVideos")) : t("empty")}
          </div>
        )}
        {player.status === "error" && (
          <div className="bg-bg/80 text-danger absolute inset-x-0 bottom-0 p-3 text-center text-sm">
            {t("error")}
          </div>
        )}
      </div>

      {item && item.videos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("versions")}>
          {item.videos.map((v, i) => {
            const label = v.label ?? t("versionN", { n: i + 1 });
            const duration = formatDuration(v.durationSec);
            if (!v.embeddable) {
              return (
                <li key={v.youtubeId}>
                  <a
                    href={youtubeWatchUrl(v.youtubeId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-border bg-surface-2 text-muted inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs"
                    title={t("notEmbeddable")}
                  >
                    <span dir="auto">{label}</span>
                    <ExternalIcon />
                  </a>
                </li>
              );
            }
            const active = v.youtubeId === selectedVideoId;
            return (
              <li key={v.youtubeId}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectVideo(v.youtubeId)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${
                    active
                      ? "border-brand-2 bg-brand-2/20 text-text"
                      : "border-border bg-surface-2 text-muted"
                  }`}
                >
                  <span dir="auto">{label}</span>
                  {duration && <span className="tabular-nums opacity-70">{duration}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3" dir="ltr">
        <span className="text-muted w-10 text-end text-xs tabular-nums">
          {formatDuration(Math.floor(player.currentTime)) ?? "0:00"}
        </span>
        <input
          type="range"
          className="accent-brand flex-1"
          min={0}
          max={Math.max(1, Math.floor(player.duration))}
          step={1}
          value={Math.min(Math.floor(player.currentTime), Math.floor(player.duration) || 0)}
          disabled={!canPlay || player.duration === 0}
          aria-label={t("seek")}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
        <span className="text-muted w-10 text-xs tabular-nums">
          {formatDuration(Math.floor(player.duration)) ?? "–:––"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          disabled={!canPlay}
          onClick={player.status === "playing" ? player.pause : player.play}
          aria-label={player.status === "playing" ? t("pause") : t("play")}
        >
          {player.status === "playing" ? <PauseIcon /> : <PlayGlyph />}
          {player.status === "playing" ? t("pause") : t("play")}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          disabled={!canPlay}
          onClick={player.restart}
        >
          {t("restart")}
        </button>
        <span className="ms-auto" />
        {item && !isSinging && (
          <button type="button" className="btn btn-primary min-h-11" onClick={onStart}>
            <PlayGlyph />
            {t("startSong")}
          </button>
        )}
        {item && isSinging && (
          <button type="button" className="btn btn-primary min-h-11" onClick={onDone}>
            {autoStart ? t("doneNext") : t("done")}
          </button>
        )}
      </div>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5v14l12-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
