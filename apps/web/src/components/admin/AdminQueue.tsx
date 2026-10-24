"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { QueuePanel } from "@/components/dj/QueuePanel";
import { useDjNight } from "@/components/dj/useDjNight";
import { Link } from "@/i18n/navigation";
import type { DjSnapshot } from "@/lib/dj/types";

/**
 * Queue management for venue owners and admins: the DJ console's queue manager (move up/down,
 * pin, priority, approve, start, done, skip, open/close the night) without the player and
 * mixer. Same state hook and server actions as the console, so both stay in step.
 */
export function AdminQueue({ initial }: { initial: DjSnapshot }) {
  const t = useTranslations("dj");
  const ta = useTranslations("admin.queue");
  const format = useFormatter();
  const { snapshot, night, isLive, connection, error, clearError, pending, run, toggleNight } =
    useDjNight(initial);
  const [autoStart, setAutoStart] = useState(true);

  return (
    <main className="flex flex-col gap-4" data-testid="admin-queue" aria-busy={pending}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{ta("title")}</h1>
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
            {isLive && <span>{t(`connection.${connection}`)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dj" className="text-muted text-sm underline">
            {ta("openConsole")}
          </Link>
          <button
            type="button"
            className={`btn min-h-10 px-4 text-sm ${night ? "btn-secondary" : "btn-primary"}`}
            onClick={toggleNight}
            disabled={pending}
          >
            {night ? t("night.close") : t("night.open")}
          </button>
        </div>
      </div>
      <p className="text-muted text-sm">{ta("hint")}</p>

      {error && (
        <div
          role="alert"
          className="bg-danger/15 text-text border-danger/40 flex items-center gap-3 rounded-xl border px-4 py-2 text-sm"
        >
          <span className="flex-1">{t(`errors.${error}`)}</span>
          <button
            type="button"
            className="underline"
            onClick={clearError}
            aria-label={ta("dismiss")}
          >
            ✕
          </button>
        </div>
      )}

      {night ? (
        <section className="card p-4">
          <QueuePanel
            snapshot={snapshot}
            onAction={run}
            autoStart={autoStart}
            onAutoStartChange={setAutoStart}
          />
        </section>
      ) : (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
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
      )}
    </main>
  );
}
