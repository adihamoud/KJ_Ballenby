"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useNow, useTranslations } from "next-intl";
import { useGuestNight } from "@/components/GuestNightContext";
import { useNightChanges } from "@/components/useNightChanges";
import { ClockIcon, CloseIcon, MicIcon, SparkleIcon } from "@/components/icons";
import { cancelSongRequest, refreshGuestQueue } from "@/lib/guest/request-actions";
import type { GuestQueueResponse, GuestRequestView } from "@/lib/guest/request-model";

/**
 * The guest's queue card: the mic, their own requests with their place in line and an
 * estimated start, and a cancel button while a request is still waiting. The view lives in
 * `GuestNightProvider` so the request sheet can hand over the server's response directly.
 * Realtime changes to the night's rows are only a hint to refetch (ARCHITECTURE.md section 4);
 * a slow poll covers a dropped channel.
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

  const cancel = (r: GuestRequestView) => {
    if (!window.confirm(t("confirmCancel", { title: r.title }))) return;
    startTransition(async () => apply(await cancelSongRequest(r.requestId)));
  };

  const upNext = view.mine.find((r) => r.status === "queued" && r.position === 1);
  const onMic = view.mine.some((r) => r.status === "now_singing");
  useTurnBuzz(Boolean(upNext) || onMic);

  return (
    <section
      className={`card flex flex-col gap-4 p-5 transition-opacity ${pending ? "opacity-80" : ""}`}
      aria-busy={pending}
      aria-live="polite"
      data-testid="guest-queue"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        {view.nightOpen && (
          <span className="badge bg-surface-3 text-muted px-2.5">
            {t("length", { count: view.queueLength })}
          </span>
        )}
      </div>

      {upNext && (
        <p className="bg-accent/15 text-accent border-accent/40 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-bold">
          <SparkleIcon size={18} className="mt-0.5 shrink-0" />
          <span>{t("youreNext", { title: upNext.title })}</span>
        </p>
      )}

      {view.nowSinging && (
        <div className="bg-surface-2 flex items-center gap-3 rounded-xl px-3.5 py-3">
          <span className="live-dot shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" dir="auto">
              {t("nowSinging", { title: view.nowSinging.title })}
            </p>
            <p className="text-muted truncate text-xs" dir="auto">
              {view.nowSinging.singers.join(", ")}
              {view.nowSinging.tableLabel && ` · ${view.nowSinging.tableLabel}`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {view.mine.length === 0 ? (
        <p className="text-muted text-sm leading-snug">
          {view.nightOpen ? t("empty") : t("closed")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {view.mine.map((r) => (
            <RequestRow key={r.requestId} request={r} pending={pending} onCancel={cancel} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestRow({
  request: r,
  pending,
  onCancel,
}: {
  request: GuestRequestView;
  pending: boolean;
  onCancel: (r: GuestRequestView) => void;
}) {
  const t = useTranslations("guest.queue");
  const singing = r.status === "now_singing";

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border p-3 ${
        singing ? "border-accent/50 bg-accent/10" : "border-border bg-surface-2"
      }`}
      data-testid="my-request"
    >
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
          singing
            ? "bg-accent text-bg"
            : r.status === "pending"
              ? "bg-surface-3 text-warning"
              : "bg-brand-2/20 text-brand-2"
        }`}
      >
        {singing ? (
          <MicIcon size={24} aria-label={t("onMic")} />
        ) : r.position !== null ? (
          <span className="text-2xl font-black tabular-nums" data-testid="my-position">
            {r.position}
          </span>
        ) : (
          <ClockIcon size={22} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold" dir="auto">
          {r.title}
        </p>
        <p className="text-muted truncate text-sm" dir="auto">
          {r.singers.join(", ")}
        </p>
        <p className={`mt-0.5 text-xs font-semibold ${singing ? "text-accent" : "text-muted"}`}>
          {singing ? (
            t("onMic")
          ) : r.status === "pending" ? (
            t("awaitingApproval")
          ) : (
            <>
              {t("ahead", { ahead: r.ahead ?? 0 })}
              <Eta startsAt={r.startsAt} />
            </>
          )}
        </p>
      </div>

      {!singing && (
        <button
          type="button"
          className="btn btn-ghost btn-sm -me-1 shrink-0 px-2.5"
          onClick={() => onCancel(r)}
          disabled={pending}
        >
          <CloseIcon size={16} />
          {t("cancel")}
        </button>
      )}
    </li>
  );
}

/**
 * "in about 12 min", refreshed every half minute; "any minute now" once it is under two.
 * Rendered on the client only: the server's clock and the guest's can land on different
 * minutes, and a hydration mismatch would re-render the whole card.
 */
function Eta({ startsAt }: { startsAt: string | null }) {
  const t = useTranslations("guest.queue");
  const now = useNow({ updateInterval: 30_000 });
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!startsAt || !mounted) return null;
  const minutes = Math.max(0, Math.round((Date.parse(startsAt) - now.getTime()) / 60_000));
  return (
    <span className="ms-1.5 inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden="true">·</span>
      <ClockIcon size={12} />
      {minutes <= 1 ? t("etaSoon") : t("eta", { minutes })}
    </span>
  );
}

/** A short buzz the moment the guest becomes next (or steps onto the mic), never on load. */
function useTurnBuzz(isTurn: boolean) {
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    if (previous.current === false && isTurn && typeof navigator !== "undefined") {
      navigator.vibrate?.([180, 90, 180]);
    }
    previous.current = isTurn;
  }, [isTurn]);
}
