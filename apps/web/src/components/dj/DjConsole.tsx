"use client";

import { useMemo, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Link } from "@/i18n/navigation";
import { nextUp, nowSinging } from "@/lib/dj/queue-model";
import type { DjSnapshot } from "@/lib/dj/types";
import { MixerPanel } from "./MixerPanel";
import { PlayerPanel } from "./PlayerPanel";
import { QueuePanel } from "./QueuePanel";
import { TableInfoProvider } from "./TableInfo";
import { useDjNight } from "./useDjNight";
import { useMicChannel } from "./useMicChannel";
import { useYouTubePlayer } from "./useYouTubePlayer";

type Tab = "queue" | "player" | "mixer";

/** Offscreen but rendered: the YouTube iframe keeps playing while another admin tab is open. */
const BACKGROUND =
  "pointer-events-none fixed top-0 h-px w-px overflow-hidden opacity-0 -start-[10000px]";

export interface DjConsoleProps {
  initial: DjSnapshot;
  /** Inside the venue admin: no page chrome of its own (the admin header has language and sign-out). */
  embedded?: boolean;
  /**
   * Another admin tab is open: the console stays mounted offscreen so music keeps playing, and a
   * small bar shows what is playing with play/pause and a way back.
   */
  background?: boolean;
  /** Tables board the table cards link to (admin only). */
  tablesHref?: string | null;
}

/**
 * The DJ console: queue manager, player and mixer on one screen. The night state (optimistic
 * host actions, refreshes, open/close) lives in `useDjNight`. Every table name opens a card with
 * that table's live details (`TableChip`).
 */
export function DjConsole({
  initial,
  embedded = false,
  background = false,
  tablesHref = null,
}: DjConsoleProps) {
  const t = useTranslations("dj");
  const format = useFormatter();
  const locale = useLocale();
  const { snapshot, night, isLive, connection, error, clearError, pending, run, toggleNight } =
    useDjNight(initial);
  const [tab, setTab] = useState<Tab>("queue");
  const [autoStart, setAutoStart] = useState(true);
  const [chosenVideo, setChosenVideo] = useState<Record<string, string>>({});
  const [masterMuted, setMasterMuted] = useState(false);

  // Player: the singer on the mic, otherwise the next fair entry cued and ready.
  const singing = nowSinging(snapshot);
  const playerItem = singing ?? nextUp(snapshot);
  const selectedVideoId = useMemo(() => {
    if (!playerItem) return null;
    const chosen = chosenVideo[playerItem.songId];
    const embeddable = playerItem.videos.filter((v) => v.embeddable);
    if (chosen && embeddable.some((v) => v.youtubeId === chosen)) return chosen;
    return embeddable[0]?.youtubeId ?? null;
  }, [chosenVideo, playerItem]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // The player panel (and its container) only exists while a night is open.
  const player = useYouTubePlayer(containerRef, selectedVideoId, { enabled: night !== null });
  const mic = useMicChannel();

  // Master mute silences both channels without forgetting their own mute state.
  const musicMutedByUser = useRef(false);
  const micMutedByUser = useRef(false);
  const onMasterMuted = (muted: boolean) => {
    if (muted) {
      musicMutedByUser.current = player.muted;
      micMutedByUser.current = mic.muted;
      player.setMuted(true);
      mic.setMuted(true);
    } else {
      player.setMuted(musicMutedByUser.current);
      mic.setMuted(micMutedByUser.current);
    }
    setMasterMuted(muted);
  };

  const startFromPlayer = () => {
    if (!playerItem?.entryId || singing) return;
    run({ type: "start", entryId: playerItem.entryId });
    if (selectedVideoId) player.play();
  };
  const doneFromPlayer = () => {
    if (!singing?.entryId) return;
    run({ type: "done", entryId: singing.entryId, startNext: autoStart });
  };

  const tabs: Tab[] = ["queue", "player", "mixer"];
  const panelClass = (own: Tab) => (tab === own ? "" : "hidden lg:block");

  const frame = embedded ? "" : "mx-auto max-w-7xl px-4";
  return (
    <TableInfoProvider snapshot={snapshot} tablesHref={tablesHref}>
      <div
        className={background ? BACKGROUND : embedded ? "flex flex-col" : "flex min-h-dvh flex-col"}
        aria-hidden={background || undefined}
        inert={background}
        data-mode={snapshot.mode}
        data-testid="dj-console"
      >
        <header
          className={
            embedded
              ? "border-border border-b pb-3"
              : "border-border bg-bg/80 sticky top-0 z-10 border-b backdrop-blur"
          }
        >
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${frame}`}>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-lg font-bold">
                {t("title")}
                <span className="text-muted font-normal"> · {snapshot.venue.name}</span>
              </h1>
              <p className="text-muted flex flex-wrap items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 ${night ? "text-brand" : ""}`}>
                  <span
                    className={`size-2 rounded-full ${night ? "bg-brand animate-pulse" : "bg-muted"}`}
                    aria-hidden="true"
                  />
                  {night ? t("night.on") : t("night.off")}
                </span>
                {night && (
                  <span>
                    {t("night.since", {
                      time: format.dateTime(new Date(night.startedAt), {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </span>
                )}
                {isLive ? (
                  <span
                    title={t(`connection.${connection}`)}
                    className="inline-flex items-center gap-1"
                  >
                    <span
                      className={`size-2 rounded-full ${
                        connection === "live"
                          ? "bg-brand-2"
                          : connection === "reconnecting"
                            ? "bg-accent animate-pulse"
                            : "bg-muted"
                      }`}
                      aria-hidden="true"
                    />
                    {t(`connection.${connection}`)}
                  </span>
                ) : (
                  <span
                    className="border-accent/60 text-accent rounded-full border px-2"
                    title={t("demoHint")}
                  >
                    {t("demoBadge")}
                  </span>
                )}
              </p>
            </div>

            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                className={`btn min-h-10 px-4 text-sm ${night ? "btn-secondary" : "btn-primary"}`}
                onClick={toggleNight}
                disabled={pending}
              >
                {night ? t("night.close") : t("night.open")}
              </button>
              {!embedded && <LocaleSwitcher />}
              {!embedded && isLive && (
                <form action={`/${locale}/auth/signout`} method="post">
                  <button type="submit" className="text-muted px-2 py-2 text-sm underline">
                    {t("signOut")}
                  </button>
                </form>
              )}
            </div>
          </div>

          <nav className={`flex gap-1 pb-2 lg:hidden ${frame}`} aria-label={t("title")}>
            {tabs.map((own) => (
              <button
                key={own}
                type="button"
                aria-pressed={tab === own}
                onClick={() => setTab(own)}
                className={`flex-1 rounded-full border py-2 text-sm font-semibold ${
                  tab === own
                    ? "border-brand-2 bg-brand-2/20 text-text"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {t(`tabs.${own}`)}
              </button>
            ))}
          </nav>
        </header>

        {error && (
          <div
            role="alert"
            className={`bg-danger/15 text-text border-danger/40 mt-3 flex items-center gap-3 rounded-xl border px-4 py-2 text-sm ${
              embedded ? "" : "mx-4"
            }`}
          >
            <span className="flex-1">{t(`errors.${error}`)}</span>
            <button type="button" className="underline" onClick={clearError}>
              ✕
            </button>
          </div>
        )}

        <main
          className={`grid w-full flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${
            embedded ? "pt-4" : "mx-auto max-w-7xl p-4"
          } ${pending ? "[&_button]:transition-opacity" : ""}`}
          aria-busy={pending}
        >
          {!night ? (
            <section className="card col-span-full flex flex-col items-center gap-3 p-8 text-center">
              <h2 className="text-xl font-bold">{t("night.closedTitle")}</h2>
              <p className="text-muted max-w-md">{t("night.closedBody")}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={toggleNight}
                disabled={pending}
              >
                {t("night.open")}
              </button>
            </section>
          ) : (
            <>
              <section className={`card p-4 ${panelClass("queue")}`}>
                <QueuePanel
                  snapshot={snapshot}
                  onAction={run}
                  autoStart={autoStart}
                  onAutoStartChange={setAutoStart}
                />
              </section>
              <div className="flex flex-col gap-4">
                <section className={`card p-4 ${panelClass("player")}`}>
                  <PlayerPanel
                    item={playerItem}
                    isSinging={singing !== null}
                    selectedVideoId={selectedVideoId}
                    onSelectVideo={(id) =>
                      playerItem && setChosenVideo((c) => ({ ...c, [playerItem.songId]: id }))
                    }
                    player={player}
                    containerRef={containerRef}
                    onStart={startFromPlayer}
                    onDone={doneFromPlayer}
                    autoStart={autoStart}
                  />
                </section>
                <section className={`card p-4 ${panelClass("mixer")}`}>
                  <MixerPanel
                    player={player}
                    mic={mic}
                    masterMuted={masterMuted}
                    onMasterMuted={onMasterMuted}
                  />
                </section>
              </div>
            </>
          )}
        </main>
      </div>
      {background && (
        <MiniPlayer
          title={playerItem?.title ?? null}
          singers={playerItem?.singers ?? []}
          status={player.status}
          onPlay={player.play}
          onPause={player.pause}
        />
      )}
    </TableInfoProvider>
  );
}

/**
 * Shown on other admin tabs while the console plays in the background: what is playing, play or
 * pause, and a way back to the console. Hidden when nothing has been played.
 */
function MiniPlayer({
  title,
  singers,
  status,
  onPlay,
  onPause,
}: {
  title: string | null;
  singers: string[];
  status: string;
  onPlay: () => void;
  onPause: () => void;
}) {
  const t = useTranslations("dj.mini");
  const tp = useTranslations("dj.player");
  if (!title || (status !== "playing" && status !== "paused")) return null;
  const playing = status === "playing";
  return (
    <div
      className="card border-brand/60 fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-center gap-3 p-3 shadow-2xl print:hidden"
      data-testid="mini-player"
      role="region"
      aria-label={t("label")}
    >
      <span
        className={`size-2.5 shrink-0 rounded-full ${playing ? "bg-brand animate-pulse" : "bg-muted"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-muted text-xs">{playing ? t("playing") : t("paused")}</p>
        <p className="truncate text-sm font-semibold" dir="auto">
          {title}
          {singers.length > 0 && (
            <span className="text-muted font-normal"> · {singers.join(" + ")}</span>
          )}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-secondary min-h-10 px-3 text-sm"
        onClick={playing ? onPause : onPlay}
      >
        {playing ? tp("pause") : tp("play")}
      </button>
      <Link href="/admin/dj" className="text-brand-2 shrink-0 text-sm font-semibold underline">
        {t("back")}
      </Link>
    </div>
  );
}
