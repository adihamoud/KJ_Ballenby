"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useNightChanges } from "@/components/useNightChanges";
import { closeNight, openNight, performHostAction, refreshDjSnapshot } from "@/lib/dj/actions";
import type { DjActionResponse } from "@/lib/dj/actions";
import { demoSnapshot } from "@/lib/dj/demo-night";
import { applyHostAction, closeNightSnapshot, nextUp, nowSinging } from "@/lib/dj/queue-model";
import type { DjSnapshot, HostAction } from "@/lib/dj/types";
import { MixerPanel } from "./MixerPanel";
import { PlayerPanel } from "./PlayerPanel";
import { QueuePanel } from "./QueuePanel";
import { useMicChannel } from "./useMicChannel";
import { useYouTubePlayer } from "./useYouTubePlayer";

type Tab = "queue" | "player" | "mixer";
type ErrorKey = Extract<DjActionResponse, { ok: false }>["error"];

/**
 * The DJ console: queue manager, player and mixer on one screen.
 *
 * State is one `DjSnapshot`. Host actions are applied optimistically with the same pure
 * model the server uses, then (in live mode) sent to the server action whose response
 * replaces the snapshot. Realtime events and a slow poll only trigger refetches, never
 * local patches (docs/ARCHITECTURE.md section 4).
 */
export function DjConsole({ initial }: { initial: DjSnapshot }) {
  const t = useTranslations("dj");
  const format = useFormatter();
  const locale = useLocale();
  const [snapshot, setSnapshot] = useState(initial);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [tab, setTab] = useState<Tab>("queue");
  const [autoStart, setAutoStart] = useState(true);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const [chosenVideo, setChosenVideo] = useState<Record<string, string>>({});
  const [masterMuted, setMasterMuted] = useState(false);

  const isLive = snapshot.mode === "live";
  const persisted = snapshot.persisted;
  const night = snapshot.night?.status === "open" ? snapshot.night : null;

  // Ordering guard: a host action's response replaces the snapshot only if no newer action was
  // sent meanwhile, and refreshes (poll, realtime hint) are dropped while actions are in flight.
  // Otherwise a slow response or a refresh started before the click re-renders the pre-action
  // state and the DJ's next tap lands on a stale card.
  const actionSeq = useRef(0);
  const inFlight = useRef(0);
  const needsRefresh = useRef(false);

  const applyResponse = useCallback((res: DjActionResponse) => {
    if (res.ok) {
      setSnapshot(res.snapshot);
    } else {
      setError(res.error);
    }
  }, []);

  const refresh = useCallback(() => {
    if (!persisted) return;
    if (inFlight.current > 0) {
      needsRefresh.current = true;
      return;
    }
    startTransition(async () => {
      const res = await refreshDjSnapshot();
      if (inFlight.current === 0) applyResponse(res);
      else needsRefresh.current = true;
    });
  }, [applyResponse, persisted]);

  // Realtime (live) and polling (anything persisted) only ever trigger a refetch.
  const connection = useNightChanges({
    nightId: night?.id ?? null,
    enabled: persisted,
    realtime: isLive,
    onRefresh: refresh,
  });

  const run = useCallback(
    (action: HostAction) => {
      const current = snapshotRef.current;
      const currentNight = current.night;
      if (!currentNight || currentNight.status !== "open") return;
      const optimistic = applyHostAction(current, action, new Date().toISOString());
      setSnapshot(optimistic.snapshot);
      if (!current.persisted) return;
      const seq = ++actionSeq.current;
      inFlight.current += 1;
      startTransition(async () => {
        try {
          const res = await performHostAction(currentNight.id, action);
          if (!res.ok) setError(res.error);
          if (seq === actionSeq.current) {
            // Latest action: its server snapshot is the truth (it includes earlier actions).
            if (res.ok) setSnapshot(res.snapshot);
            else applyResponse(await refreshDjSnapshot());
          } else {
            // Superseded by a newer action; its response will carry this one's effect.
            needsRefresh.current = true;
          }
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0 && needsRefresh.current) {
            needsRefresh.current = false;
            applyResponse(await refreshDjSnapshot());
          }
        }
      });
    },
    [applyResponse],
  );

  const toggleNight = useCallback(() => {
    const current = snapshotRef.current;
    if (current.night?.status === "open") {
      // Only what is still waiting gets skipped; the singer on the mic finishes as done.
      const waiting = current.items.filter((i) => i.status !== "now_singing").length;
      if (waiting > 0 && !window.confirm(t("night.confirmClose", { count: waiting }))) return;
      if (!current.persisted) {
        setSnapshot(closeNightSnapshot(current, new Date().toISOString()));
        return;
      }
      const nightId = current.night.id;
      startTransition(async () => applyResponse(await closeNight(nightId)));
    } else {
      if (!current.persisted) {
        setSnapshot(demoSnapshot());
        return;
      }
      startTransition(async () => applyResponse(await openNight()));
    }
  }, [applyResponse, t]);

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

  return (
    <div className="flex min-h-dvh flex-col" data-mode={snapshot.mode}>
      <header className="border-border bg-bg/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
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
            <LocaleSwitcher />
            {isLive && (
              <form action={`/${locale}/auth/signout`} method="post">
                <button type="submit" className="text-muted px-2 py-2 text-sm underline">
                  {t("signOut")}
                </button>
              </form>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 px-4 pb-2 lg:hidden" aria-label={t("title")}>
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
          className="bg-danger/15 text-text border-danger/40 mx-4 mt-3 flex items-center gap-3 rounded-xl border px-4 py-2 text-sm"
        >
          <span className="flex-1">{t(`errors.${error}`)}</span>
          <button type="button" className="underline" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <main
        className={`mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${
          pending ? "[&_button]:transition-opacity" : ""
        }`}
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
  );
}
