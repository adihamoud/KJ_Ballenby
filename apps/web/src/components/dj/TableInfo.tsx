"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buildTableBoard } from "@/lib/admin/tonight";
import { loadTableSeating, type TableSeating } from "@/lib/dj/table-actions";
import type { DjSnapshot } from "@/lib/dj/types";

interface TableInfoValue {
  snapshot: DjSnapshot;
  /** Tables board to link to (admin only); null hides the link. */
  tablesHref: string | null;
}

const TableInfoContext = createContext<TableInfoValue | null>(null);

/** Gives every table chip below it the night's data, so each can open a table card. */
export function TableInfoProvider({
  snapshot,
  tablesHref,
  children,
}: TableInfoValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ snapshot, tablesHref }), [snapshot, tablesHref]);
  return <TableInfoContext.Provider value={value}>{children}</TableInfoContext.Provider>;
}

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 220;
const CARD_WIDTH = 288;
const SEATING_TTL_MS = 15_000;

const CHIP =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs border-border text-muted";

/**
 * A table's name that opens its card on hover (mouse), focus (keyboard) or tap (touch): when the
 * table opened, who sits there, the song on the mic, its next turn with an estimated start, what
 * is waiting and what was sung, and a link to the tables board. Without a provider (or for
 * walk-ups) it renders as a plain chip.
 */
export function TableChip({
  tableId,
  children,
}: {
  tableId: string | null;
  children: React.ReactNode;
}) {
  const info = useContext(TableInfoContext);
  if (!info || !tableId || info.snapshot.night?.status !== "open") {
    return <span className={CHIP}>{children}</span>;
  }
  return (
    <InteractiveTableChip tableId={tableId} info={info}>
      {children}
    </InteractiveTableChip>
  );
}

function InteractiveTableChip({
  tableId,
  info,
  children,
}: {
  tableId: string;
  info: TableInfoValue;
  children: React.ReactNode;
}) {
  const t = useTranslations("dj.tableCard");
  const cardId = useId();
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const [seating, setSeating] = useState<{ value: TableSeating | null; at: number } | null>(null);
  const [loadingSeating, setLoadingSeating] = useState(false);
  /** Where the chip was when the card opened; a scroll that leaves it there is ignored. */
  const anchor = useRef<{ top: number; left: number } | null>(null);

  const nightId = info.snapshot.night?.id ?? null;
  const live = info.snapshot.mode === "live";

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const show = useCallback(() => {
    const chip = chipRef.current;
    if (!chip) return;
    const rect = chip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - 16);
    const rtl = document.documentElement.dir === "rtl";
    // Align the card's start edge with the chip's, then keep it inside the viewport. Fixed
    // positioning never adds page width, so the card cannot cause sideways scrolling.
    const preferredLeft = rtl ? rect.right - width : rect.left;
    const left = Math.min(Math.max(preferredLeft, 8), vw - width - 8);
    const below = vh - rect.bottom > 280 || rect.top < 280;
    anchor.current = { top: rect.top, left: rect.left };
    setPlace(
      below
        ? { position: "fixed", top: rect.bottom + 6, left, width }
        : { position: "fixed", bottom: vh - rect.top + 6, left, width },
    );
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  // Seating (guests, opening time) is fetched when the card opens and cached briefly.
  useEffect(() => {
    if (!open || !live || !nightId) return;
    if (seating && Date.now() - seating.at < SEATING_TTL_MS) return;
    let cancelled = false;
    setLoadingSeating(true);
    void loadTableSeating(nightId, tableId).then((res) => {
      if (cancelled) return;
      setLoadingSeating(false);
      if (res.ok) setSeating({ value: res.seating, at: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [open, live, nightId, tableId, seating]);

  // Close on Escape, outside press, scroll and resize (the card is placed for the current layout).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hide();
        chipRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!chipRef.current?.contains(target) && !cardRef.current?.contains(target)) hide();
    };
    // Scroll events are delivered a frame late: the scroll that brought the chip into view
    // before a tap arrives after the tap opened the card, so only a scroll that actually moved
    // the chip closes it (the card is placed for where the chip was).
    const onScroll = () => {
      const rect = chipRef.current?.getBoundingClientRect();
      const was = anchor.current;
      if (rect && was && Math.abs(rect.top - was.top) < 1 && Math.abs(rect.left - was.left) < 1) {
        return;
      }
      hide();
    };
    const onResize = () => hide();
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, hide]);

  useEffect(() => clearTimer, []);

  const hoverIn = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    if (!open) timer.current = setTimeout(show, OPEN_DELAY_MS);
  };
  const hoverOut = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    timer.current = setTimeout(hide, CLOSE_DELAY_MS);
  };

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className={`${CHIP} hover:border-brand-2 hover:text-text focus-visible:border-brand-2 cursor-pointer ${
          open ? "border-brand-2 text-text" : ""
        }`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        aria-label={t("open", { label: info.snapshot.tables[tableId] ?? "" })}
        data-testid="table-chip"
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        onFocus={(e) => {
          // Keyboard focus opens the card; a mouse or touch press focuses too, but its click
          // toggles the card, so opening here as well would close it again on the same press.
          if (!open && e.currentTarget.matches(":focus-visible")) show();
        }}
        onClick={() => (open ? hide() : show())}
      >
        {children}
      </button>
      {open && (
        <div
          ref={cardRef}
          id={cardId}
          role="dialog"
          aria-label={t("open", { label: info.snapshot.tables[tableId] ?? "" })}
          style={place}
          className="card border-brand-2/60 z-50 flex flex-col gap-2.5 p-3 text-start text-sm shadow-2xl"
          data-testid="table-card-popover"
          onPointerEnter={(e) => e.pointerType === "mouse" && clearTimer()}
          onPointerLeave={hoverOut}
        >
          <TableCardBody
            tableId={tableId}
            snapshot={info.snapshot}
            seating={seating?.value ?? null}
            loadingSeating={loadingSeating && !seating}
            tablesHref={info.tablesHref}
            onNavigate={hide}
          />
        </div>
      )}
    </>
  );
}

function TableCardBody({
  tableId,
  snapshot,
  seating,
  loadingSeating,
  tablesHref,
  onNavigate,
}: {
  tableId: string;
  snapshot: DjSnapshot;
  seating: TableSeating | null;
  loadingSeating: boolean;
  tablesHref: string | null;
  onNavigate: () => void;
}) {
  const t = useTranslations("dj.tableCard");
  const format = useFormatter();
  const now = useNow({ updateInterval: 15_000 });
  const row = useMemo(
    () => buildTableBoard(snapshot).rows.find((r) => r.tableId === tableId) ?? null,
    [snapshot, tableId],
  );
  if (!row) return null;

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
  const rel = (iso: string) => format.relativeTime(new Date(iso), now);
  const ago = (iso: string) => {
    const d = new Date(iso);
    return format.relativeTime(d > now ? now : d, now);
  };

  const openedAt = seating?.openedAt ?? row.openedAt;
  const guests = seating
    ? seating.guests
    : row.guests.map((g) => ({ userId: g.userId, name: g.name, joinedAt: g.joinedAt }));
  const next = row.waiting.find((s) => s.status === "queued") ?? null;
  const pendingCount = row.waiting.filter((s) => s.status === "pending").length;
  const lastSung = row.sung[0] ?? null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold" dir="auto">
          {row.label}
        </span>
        <span className="text-muted text-xs">
          {openedAt ? t("openSince", { time: time(openedAt), ago: ago(openedAt) }) : t("notOpened")}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted text-xs font-semibold tracking-wide uppercase">
          {t("guests", { count: guests.length })}
        </span>
        {loadingSeating && guests.length === 0 ? (
          <span className="text-muted text-xs">{t("loading")}</span>
        ) : guests.length === 0 ? (
          <span className="text-muted text-xs">{t("noGuests")}</span>
        ) : (
          <ul className="flex flex-wrap gap-1" data-testid="table-card-guests">
            {guests.map((g) => (
              <li
                key={g.userId}
                className="bg-surface-2 rounded-full px-2 py-0.5 text-xs"
                title={g.joinedAt ? t("joinedAt", { time: time(g.joinedAt) }) : undefined}
                dir="auto"
              >
                {g.name ?? t("unknownGuest")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {row.nowSinging && (
        <p className="bg-brand/15 rounded-lg px-2 py-1.5 text-xs" dir="auto">
          <span className="text-brand font-semibold">{t("onMic")} </span>
          <span className="font-semibold">{row.nowSinging.title}</span>
          {row.nowSinging.singers.length > 0 && (
            <span className="text-muted"> · {row.nowSinging.singers.join(" + ")}</span>
          )}
        </p>
      )}

      <div className="flex flex-col gap-0.5" data-testid="table-card-next">
        <span className="text-muted text-xs font-semibold tracking-wide uppercase">
          {t("nextTurn")}
        </span>
        {next ? (
          <p className="text-xs" dir="auto">
            <span className="bg-brand-2/25 me-1.5 rounded-full px-1.5 py-0.5 font-bold tabular-nums">
              {next.place}
            </span>
            <span className="font-semibold">{next.title}</span>
            {next.estimatedStartAt && (
              <span className="text-muted">
                {" "}
                · {t("startsAround", { when: rel(next.estimatedStartAt) })}
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted text-xs">{t("nothingWaiting")}</p>
        )}
      </div>

      <p className="text-muted text-xs">
        {t("tally", {
          waiting: row.waiting.length - pendingCount,
          pending: pendingCount,
          sung: row.sung.length,
        })}
        {lastSung && <> · {t("lastSang", { ago: ago(lastSung.at) })}</>}
      </p>

      {tablesHref && (
        <Link
          href={`${tablesHref}#table-${tableId}`}
          onClick={onNavigate}
          className="text-brand-2 self-start text-xs font-semibold underline"
          data-testid="table-card-link"
        >
          {t("showOnBoard")}
        </Link>
      )}
    </>
  );
}
