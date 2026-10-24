"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useGuestNight } from "@/components/GuestNightContext";
import { useNightChanges } from "@/components/useNightChanges";
import { cancelSongRequest, refreshGuestQueue } from "@/lib/guest/request-actions";
import type { GuestQueueResponse } from "@/lib/guest/request-model";

/**
 * The guest's queue card: the mic, their own requests with their place in line, and a cancel
 * button while a request is still waiting. The view lives in `GuestNightProvider` so the request
 * sheet can hand over the server's response directly. Realtime changes to the night's rows are
 * only a hint to refetch (ARCHITECTURE.md section 4); a slow poll covers a dropped channel.
 */
export function GuestQueue() {
  const t = useTranslations("guest.queue");
  const { view, setView } = useGuestNight();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (res: GuestQueueResponse) => {
      if (res.ok) {
        setView(res.view);
        setError(null);
      } else {
        setError(t(`errors.${res.error}`));
      }
    },
    [setView, t],
  );

  const refresh = useCallback(() => {
    startTransition(async () => apply(await refreshGuestQueue()));
  }, [apply]);

  // Demo nights live in the server store too, so polling keeps the guest in step with the DJ.
  useNightChanges({
    nightId: view.nightId,
    enabled: true,
    realtime: view.mode === "live",
    onRefresh: refresh,
  });

  const cancel = (requestId: string) => {
    if (!window.confirm(t("confirmCancel"))) return;
    startTransition(async () => apply(await cancelSongRequest(requestId)));
  };

  const upNext = view.mine.find((r) => r.status === "queued" && r.position === 1);

  return (
    <section
      className={`card flex flex-col gap-3 p-5 ${pending ? "opacity-80" : ""}`}
      aria-busy={pending}
      aria-live="polite"
      data-testid="guest-queue"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {view.nightOpen && (
          <span className="text-muted text-sm">{t("length", { count: view.queueLength })}</span>
        )}
      </div>

      {upNext && (
        <p className="bg-brand/15 text-brand rounded-xl px-3 py-2 text-sm font-semibold">
          {t("youreNext", { title: upNext.title })}
        </p>
      )}

      {view.nowSinging && (
        <p className="text-muted text-sm" dir="auto">
          {t("nowSinging", {
            title: view.nowSinging.title,
            singers: view.nowSinging.singers.join(", "),
          })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {view.mine.length === 0 ? (
        <p className="text-muted text-sm">{view.nightOpen ? t("empty") : t("closed")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.mine.map((r) => (
            <li
              key={r.requestId}
              className="bg-surface-2 flex items-center gap-3 rounded-xl p-3"
              data-testid="my-request"
            >
              <div className="text-brand-2 w-12 shrink-0 text-center">
                {r.status === "now_singing" ? (
                  <span className="text-xl" aria-label={t("onMic")}>
                    🎤
                  </span>
                ) : r.position !== null ? (
                  <span className="text-2xl font-bold tabular-nums" data-testid="my-position">
                    {r.position}
                  </span>
                ) : (
                  <span className="text-lg" aria-hidden="true">
                    ⏳
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" dir="auto">
                  {r.title}
                </p>
                <p className="text-muted truncate text-sm" dir="auto">
                  {r.singers.join(", ")}
                </p>
                <p className="text-muted text-xs">
                  {r.status === "now_singing"
                    ? t("onMic")
                    : r.status === "pending"
                      ? t("awaitingApproval")
                      : t("place", { position: r.position ?? 0, ahead: r.ahead ?? 0 })}
                </p>
              </div>
              {r.status !== "now_singing" && (
                <button
                  type="button"
                  className="text-muted shrink-0 px-2 py-2 text-sm underline"
                  onClick={() => cancel(r.requestId)}
                  disabled={pending}
                >
                  {t("cancel")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
