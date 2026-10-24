"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useNightChanges } from "@/components/useNightChanges";
import { refreshTonightBoard } from "@/lib/admin/tonight-actions";
import type { TableBoard, TableBoardRow, TableSong } from "@/lib/admin/tonight";

/**
 * "Tables tonight": one card per table with who sits there, when the table opened, the song on
 * the mic, what is waiting (with its place in the queue) and what was sung. Read only; kept fresh
 * the same way as the queue (realtime hint, slow poll, refetch).
 */
export function TablesBoard({ initial }: { initial: TableBoard }) {
  const t = useTranslations("admin.tonight");
  const [board, setBoard] = useState(initial);
  const [pending, startTransition] = useTransition();
  const now = useNow({ updateInterval: 30_000 });
  const highlighted = useHashHighlight();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await refreshTonightBoard();
      if (res.ok) setBoard(res.board);
    });
  }, []);

  useNightChanges({
    nightId: board.nightId,
    enabled: board.persisted,
    realtime: board.mode === "live",
    onRefresh: refresh,
  });

  return (
    <main className="flex flex-col gap-4" data-testid="tables-board" aria-busy={pending}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted text-sm">{t("hint")}</p>
      </div>

      {board.nightId ? (
        <p className="card p-3 text-sm font-medium" data-testid="tables-summary">
          {t("summary", board.totals)}
        </p>
      ) : (
        <p className="card text-muted p-4 text-sm">{t("nightClosed")}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {board.rows.map((row) => (
          <TableCard
            key={row.tableId ?? "walk-up"}
            row={row}
            now={now}
            nightOpen={!!board.nightId}
            highlighted={highlighted === anchorOf(row)}
          />
        ))}
      </div>
    </main>
  );
}

function TableCard({
  row,
  now,
  nightOpen,
  highlighted,
}: {
  row: TableBoardRow;
  now: Date;
  nightOpen: boolean;
  highlighted: boolean;
}) {
  const t = useTranslations("admin.tonight");
  const format = useFormatter();
  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
  const ago = (iso: string) => {
    const date = new Date(iso);
    return format.relativeTime(date > now ? now : date, now);
  };
  const opened = nightOpen && row.openedAt !== null;
  const songCount = row.waiting.length + row.sung.length + (row.nowSinging ? 1 : 0);

  return (
    <article
      className={`card flex scroll-mt-24 flex-col gap-3 p-4 transition-shadow duration-700 ${opened ? "" : "opacity-70"} ${
        row.nowSinging ? "border-brand" : ""
      } ${highlighted ? "ring-brand-2 shadow-2xl ring-2" : ""}`}
      data-testid="table-card"
      data-table-label={row.label ?? ""}
      data-highlighted={highlighted || undefined}
      id={anchorOf(row)}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold" dir="auto">
            {row.label ?? t("walkUp")}
          </h2>
          <p className="text-muted text-xs" data-testid="table-opened">
            {opened && row.openedAt
              ? t("openSince", { time: time(row.openedAt), ago: ago(row.openedAt) })
              : t("notOpened")}
          </p>
        </div>
        <span className="bg-surface-2 text-muted rounded-full px-2.5 py-1 text-xs tabular-nums">
          {t("counts", { guests: row.guests.length, songs: songCount })}
        </span>
      </header>

      {nightOpen && (
        <section className="flex flex-col gap-1.5" aria-label={t("guests")}>
          <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
            {t("guests")} · {row.guests.length}
          </h3>
          {row.guests.length === 0 ? (
            <p className="text-muted text-sm">{t("noGuests")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" data-testid="table-guests">
              {row.guests.map((g) => (
                <li
                  key={g.userId}
                  className="bg-surface-2 border-border rounded-full border px-2.5 py-1 text-sm"
                  title={g.joinedAt ? t("joinedAt", { time: time(g.joinedAt) }) : undefined}
                  dir="auto"
                >
                  {g.name ?? t("unknownGuest")}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {row.nowSinging && (
        <div
          className="bg-brand/15 border-brand/40 flex flex-col gap-0.5 rounded-xl border p-3"
          data-testid="table-now-singing"
        >
          <span className="text-brand text-xs font-semibold tracking-wide uppercase">
            {t("nowSinging")} · {ago(row.nowSinging.at)}
          </span>
          <SongLine song={row.nowSinging} />
        </div>
      )}

      {nightOpen && (
        <section className="flex flex-col gap-1.5" aria-label={t("waiting")}>
          <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
            {t("waiting")} · {row.waiting.length}
          </h3>
          {row.waiting.length === 0 ? (
            <p className="text-muted text-sm">{t("noWaiting")}</p>
          ) : (
            <ol className="flex flex-col gap-1.5" data-testid="table-waiting">
              {row.waiting.map((song) => (
                <li key={song.requestId} className="flex items-start gap-2">
                  {song.place !== null ? (
                    <span
                      className="bg-brand-2/25 text-text flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                      title={t("placeHint", { place: song.place })}
                    >
                      {song.place}
                    </span>
                  ) : (
                    <span className="border-accent/50 text-accent shrink-0 rounded-full border px-2 py-0.5 text-xs">
                      {t("pending")}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <SongLine song={song} />
                    <p className="text-muted text-xs">
                      {t("requested", { ago: ago(song.at) })}
                      {song.estimatedStartAt && (
                        <span className="text-text ms-2" data-testid="table-starts">
                          {t("startsAround", {
                            when: format.relativeTime(new Date(song.estimatedStartAt), now),
                          })}
                        </span>
                      )}
                      {song.movedByHand && (
                        <span className="text-brand ms-2">{t("movedByHand")}</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {nightOpen && (
        <details className="group" open={row.sung.length > 0 && row.sung.length <= 3}>
          <summary className="text-muted cursor-pointer text-xs font-semibold tracking-wide uppercase">
            {t("sung")} · {row.sung.length}
          </summary>
          {row.sung.length === 0 ? (
            <p className="text-muted mt-1.5 text-sm">{t("noSung")}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1" data-testid="table-sung">
              {row.sung.map((song) => (
                <li key={song.requestId} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted shrink-0 text-xs tabular-nums">{time(song.at)}</span>
                  <SongLine song={song} compact />
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </article>
  );
}

function SongLine({ song, compact = false }: { song: TableSong; compact?: boolean }) {
  return (
    <p className={`min-w-0 ${compact ? "truncate" : ""}`} dir="auto">
      <span className="font-semibold">{song.title}</span>
      <span className="text-muted"> · {song.artist}</span>
      {song.singers.length > 0 && (
        <span className="text-muted block text-xs" dir="auto">
          {song.singers.join(" + ")}
        </span>
      )}
      {!compact && song.note && (
        <span className="text-accent block text-xs" dir="auto">
          “{song.note}”
        </span>
      )}
    </p>
  );
}

/** Anchor id of a table card, the target of "Show on the tables board" links. */
function anchorOf(row: TableBoardRow): string {
  return `table-${row.tableId ?? "walk-up"}`;
}

/**
 * The table named in the URL hash (`#table-<id>`), highlighted for a few seconds and scrolled into
 * view. Read on arrival and on hash changes; client navigation does not update CSS `:target`.
 */
function useHashHighlight(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash.startsWith("table-")) return;
      setId(hash);
      document.getElementById(hash)?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (clear) clearTimeout(clear);
      clear = setTimeout(() => setId(null), 4000);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      if (clear) clearTimeout(clear);
    };
  }, []);
  return id;
}
