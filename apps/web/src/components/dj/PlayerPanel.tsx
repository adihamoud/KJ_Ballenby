"use client";

import { useTranslations } from "next-intl";
import type { DjQueueItem } from "@/lib/dj/types";
import { formatDuration, youtubeWatchUrl } from "@/lib/youtube";
import { TableChip } from "./TableInfo";
import type { DeckControls } from "./useYouTubePlayer";

interface PlayerPanelProps {
  /** The song on the mic, or the next one cued when nobody is singing. */
  item: DjQueueItem | null;
  isSinging: boolean;
  selectedVideoId: string | null;
  onSelectVideo: (youtubeId: string) => void;
  /** Who takes the mic after `item`; their video preloads on the standby deck. */
  deckItem: DjQueueItem | null;
  deckVideoId: string | null;
  player: DeckControls;
  /** One container per deck. Their iframes never move in the DOM (that would reload them). */
  deckRefs: readonly [
    React.RefObject<HTMLDivElement | null>,
    React.RefObject<HTMLDivElement | null>,
  ];
  onStart: () => void;
  onDone: () => void;
  autoStart: boolean;
}

export function PlayerPanel({
  item,
  isSinging,
  selectedVideoId,
  onSelectVideo,
  deckItem,
  deckVideoId,
  player,
  deckRefs,
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
            {item.tableLabel && (
              <span className="ms-2 inline-flex">
                <TableChip tableId={item.tableId}>{item.tableLabel}</TableChip>
              </span>
            )}
          </p>
        </div>
      ) : (
        <div>
          <p className="font-medium">{t("empty")}</p>
          <p className="text-muted text-sm">{t("emptyHint")}</p>
        </div>
      )}

      {/*
        Both decks share one grid: the active deck fills the big frame (row 1) and the standby
        deck sits in the small "On deck" frame (row 2). Swapping decks only swaps their classes.
      */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <div className="bg-surface-2 border-border col-span-full row-start-1 aspect-video w-full rounded-xl border" />
        {deckRefs.map((ref, deck) => {
          const isActive = deck === player.activeDeck;
          return (
            <div
              key={deck}
              ref={ref}
              dir="ltr"
              data-deck={isActive ? "active" : "standby"}
              data-deck-index={deck}
              aria-hidden={isActive ? undefined : true}
              // Standby is a preview only: keep its iframe out of the Tab order too.
              inert={!isActive}
              className={`relative overflow-hidden [&>iframe]:size-full ${
                isActive
                  ? "col-span-full row-start-1 aspect-video w-full rounded-xl"
                  : `border-border pointer-events-none col-start-1 row-start-2 aspect-video w-36 rounded-lg border sm:w-44 ${
                      deckVideoId ? "" : "invisible"
                    }`
              }`}
            />
          );
        })}
        {!hasVideo && (
          <div className="text-muted relative z-10 col-span-full row-start-1 flex items-center justify-center p-6 text-center text-sm">
            {item ? (item.videos.length > 0 ? t("noEmbeddable") : t("noVideos")) : t("empty")}
          </div>
        )}
        {player.status === "error" && (
          <div role="alert" className="relative z-10 col-span-full row-start-1 self-end">
            <p className="bg-bg/80 text-danger p-3 text-center text-sm">{t("error")}</p>
          </div>
        )}
        <div
          className="col-start-2 row-start-2 flex min-w-0 flex-col justify-center gap-0.5"
          data-testid="on-deck"
        >
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t("onDeck")}</p>
          {deckItem && (
            <>
              <p className="min-w-0 text-sm font-semibold break-words" dir="auto">
                {deckItem.title}
                <span className="text-muted font-normal"> · {deckItem.artist}</span>
              </p>
              <p className="text-muted min-w-0 text-xs break-words" dir="auto">
                {deckItem.singers.join(" + ")}
              </p>
            </>
          )}
          {/* Always mounted so screen readers announce the first change too. */}
          <p role="status" className={deckItem ? "text-muted text-xs" : "text-muted text-sm"}>
            {deckItem
              ? deckVideoId
                ? t(`deckStatus.${player.deckStatus}`)
                : t("deckNoVideo")
              : t("deckEmpty")}
          </p>
        </div>
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
