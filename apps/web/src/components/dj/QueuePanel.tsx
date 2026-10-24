"use client";

import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { DjHistoryItem, DjQueueItem, DjSnapshot, HostAction } from "@/lib/dj/types";
import { nowSinging, orderedQueue, pendingItems } from "@/lib/dj/queue-model";
import { formatDuration } from "@/lib/youtube";

interface QueuePanelProps {
  snapshot: DjSnapshot;
  onAction: (action: HostAction) => void;
  autoStart: boolean;
  onAutoStartChange: (value: boolean) => void;
}

/**
 * A row's timestamp for relative display. The panel's clock starts from the server's request
 * time and ticks every 30 s, so a request made a moment ago can be "newer" than the clock and
 * would read "in 5 seconds"; clamp it to "now".
 */
function noLaterThan(iso: string, now: Date): Date {
  const date = new Date(iso);
  return date > now ? now : date;
}

/** Text the DJ pastes into VirtualDJ's search box (PRD H4). */
export function virtualDjSearchText(item: Pick<DjQueueItem, "externalRef" | "title" | "artist">) {
  return item.externalRef ?? `${item.artist} - ${item.title}`;
}

export function QueuePanel({ snapshot, onAction, autoStart, onAutoStartChange }: QueuePanelProps) {
  const t = useTranslations("dj.queue");
  // One clock for every relative time on the panel instead of a timer per row.
  const now = useNow({ updateInterval: 30_000 });
  const singing = nowSinging(snapshot);
  const queued = orderedQueue(snapshot).filter((i) => i.status === "queued");
  const pending = pendingItems(snapshot);
  const showPriority = snapshot.rules.hostPriorityEnabled;

  return (
    <div className="flex flex-col gap-4" data-testid="queue-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-lg font-semibold">
          {t("title")}
          <span className="text-muted text-sm font-normal">
            {t("count", { count: queued.length })}
          </span>
        </h2>
        <label className="text-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand size-4"
            checked={autoStart}
            onChange={(e) => onAutoStartChange(e.target.checked)}
          />
          {t("autoStart")}
        </label>
      </div>

      <section aria-labelledby="now-singing-title">
        <h3
          id="now-singing-title"
          className="text-brand mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          {t("nowSinging")}
        </h3>
        {singing ? (
          <NowSingingCard item={singing} now={now} onAction={onAction} autoStart={autoStart} />
        ) : (
          <div className="card border-dashed p-4">
            <p className="font-medium">{t("nothingSinging")}</p>
            <p className="text-muted text-sm">{t("nothingSingingHint")}</p>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="flex flex-col gap-2">
          <h3
            id="pending-title"
            className="text-accent text-xs font-semibold tracking-wide uppercase"
          >
            {t("pending")} · {pending.length}
          </h3>
          <ul className="flex flex-col gap-2">
            {pending.map((item) => (
              <li
                key={item.requestId}
                className="card border-accent/40 flex flex-wrap items-center gap-3 p-3"
              >
                <SongSummary item={item} now={now} />
                <div className="ms-auto flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary min-h-10 px-4 text-sm"
                    onClick={() =>
                      onAction({
                        type: "approve",
                        requestId: item.requestId,
                        entryId: crypto.randomUUID(),
                      })
                    }
                  >
                    {t("actions.approve")}
                  </button>
                  <IconButton
                    label={t("actions.skip")}
                    onClick={() => onAction({ type: "skip", requestId: item.requestId })}
                  >
                    <SkipIcon />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="up-next-title" className="flex flex-col gap-2">
        <h3 id="up-next-title" className="text-muted text-xs font-semibold tracking-wide uppercase">
          {t("upNext")}
        </h3>
        {queued.length === 0 ? (
          <p className="text-muted text-sm">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {queued.map((item, index) => (
              <QueueRow
                key={item.requestId}
                item={item}
                now={now}
                index={index}
                total={queued.length}
                highlighted={index < 3}
                showPriority={showPriority}
                onAction={onAction}
              />
            ))}
          </ol>
        )}
      </section>

      <HistoryList history={snapshot.history} />
    </div>
  );
}

function NowSingingCard({
  item,
  now,
  onAction,
  autoStart,
}: {
  item: DjQueueItem;
  now: Date;
  onAction: (action: HostAction) => void;
  autoStart: boolean;
}) {
  const t = useTranslations("dj.queue");
  const format = useFormatter();
  const entryId = item.entryId as string;

  return (
    <article
      className="card border-brand from-brand/15 to-brand-2/10 flex flex-col gap-3 bg-gradient-to-br p-4"
      data-testid="now-singing"
    >
      <div className="flex flex-wrap items-start gap-3">
        <SongSummary item={item} now={now} large />
        {item.startedAt && (
          <p className="text-muted ms-auto text-xs whitespace-nowrap">
            {t("startedAgo", { time: format.relativeTime(noLaterThan(item.startedAt, now), now) })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11 flex-1"
          onClick={() => onAction({ type: "done", entryId, startNext: autoStart })}
        >
          {autoStart ? t("actions.doneNext") : t("actions.done")}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          onClick={() => onAction({ type: "skip", requestId: item.requestId })}
        >
          {t("actions.skip")}
        </button>
        <CopyButton item={item} />
      </div>
    </article>
  );
}

function QueueRow({
  item,
  now,
  index,
  total,
  highlighted,
  showPriority,
  onAction,
}: {
  item: DjQueueItem;
  now: Date;
  index: number;
  total: number;
  highlighted: boolean;
  showPriority: boolean;
  onAction: (action: HostAction) => void;
}) {
  const t = useTranslations("dj.queue");
  const entryId = item.entryId as string;

  return (
    <li
      className={`card flex flex-col gap-2 p-3 ${highlighted ? "border-brand-2/60" : ""}`}
      data-testid="queue-row"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
            highlighted ? "bg-brand-2/25 text-text" : "bg-surface-2 text-muted"
          }`}
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <SongSummary item={item} now={now} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn btn-primary min-h-9 px-3 text-sm"
          onClick={() => onAction({ type: "start", entryId })}
        >
          <PlayIcon />
          {t("actions.start")}
        </button>
        <IconButton
          label={t("actions.moveUp")}
          disabled={index === 0}
          onClick={() => onAction({ type: "move", entryId, direction: "up" })}
        >
          <ArrowIcon direction="up" />
        </IconButton>
        <IconButton
          label={t("actions.moveDown")}
          disabled={index === total - 1}
          onClick={() => onAction({ type: "move", entryId, direction: "down" })}
        >
          <ArrowIcon direction="down" />
        </IconButton>
        <IconButton
          label={item.lockedByHost ? t("actions.unpin") : t("actions.pin")}
          pressed={item.lockedByHost}
          onClick={() => onAction({ type: "pin", entryId, locked: !item.lockedByHost })}
        >
          <PinIcon />
        </IconButton>
        {showPriority && (
          <>
            <IconButton
              label={t("actions.priorityUp")}
              onClick={() =>
                onAction({
                  type: "priority",
                  requestId: item.requestId,
                  priority: item.priority + 1,
                })
              }
            >
              <PriorityIcon direction="up" />
            </IconButton>
            <IconButton
              label={t("actions.priorityDown")}
              disabled={item.priority <= 0}
              onClick={() =>
                onAction({
                  type: "priority",
                  requestId: item.requestId,
                  priority: item.priority - 1,
                })
              }
            >
              <PriorityIcon direction="down" />
            </IconButton>
          </>
        )}
        <IconButton
          label={t("actions.skip")}
          onClick={() => onAction({ type: "skip", requestId: item.requestId })}
        >
          <SkipIcon />
        </IconButton>
        <span className="ms-auto">
          <CopyButton item={item} compact />
        </span>
      </div>
    </li>
  );
}

function SongSummary({
  item,
  now,
  large = false,
}: {
  item: DjQueueItem;
  now: Date;
  large?: boolean;
}) {
  const t = useTranslations("dj.queue");
  const format = useFormatter();
  const duration = formatDuration(item.durationSec);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className={`truncate font-semibold ${large ? "text-xl" : ""}`} dir="auto">
        {item.title}
        <span className="text-muted font-normal"> · {item.artist}</span>
      </p>
      <p className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-text" dir="auto">
          {item.singers.join(" + ")}
        </span>
        <Chip>{item.tableLabel ? t("table", { label: item.tableLabel }) : t("walkUp")}</Chip>
        {item.priority > 0 && <Chip tone="accent">{t("priority", { n: item.priority })}</Chip>}
        {item.lockedByHost && <Chip tone="brand">{t("pinned")}</Chip>}
        {duration && <span className="tabular-nums">{duration}</span>}
        <time dateTime={item.createdAt} className="whitespace-nowrap">
          {format.relativeTime(noLaterThan(item.createdAt, now), now)}
        </time>
      </p>
      {item.note && (
        <p className="text-accent text-sm" dir="auto">
          “{item.note}”
        </p>
      )}
    </div>
  );
}

function HistoryList({ history }: { history: DjHistoryItem[] }) {
  const t = useTranslations("dj.queue");
  const format = useFormatter();
  return (
    <details className="card p-3">
      <summary className="text-muted cursor-pointer text-sm font-semibold">
        {t("history")} · {history.length}
      </summary>
      {history.length === 0 ? (
        <p className="text-muted mt-2 text-sm">{t("historyEmpty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {[...history].reverse().map((h) => (
            <li key={h.requestId} className="flex items-baseline gap-2" dir="auto">
              <span className="text-muted tabular-nums">
                {format.dateTime(new Date(h.endedAt), { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate font-medium">{h.title}</span>
              <span className="text-muted truncate">{h.singers.join(" + ")}</span>
              {h.tableLabel && <Chip>{t("table", { label: h.tableLabel })}</Chip>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function CopyButton({ item, compact = false }: { item: DjQueueItem; compact?: boolean }) {
  const t = useTranslations("dj.queue");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(virtualDjSearchText(item));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); the DJ can still read the title.
    }
  };
  if (compact) {
    return (
      <IconButton
        label={copied ? t("actions.copied") : t("actions.copy")}
        onClick={copy}
        pressed={copied}
      >
        <CopyIcon />
      </IconButton>
    );
  }
  return (
    <button type="button" className="btn btn-secondary min-h-11" onClick={copy}>
      <CopyIcon />
      {copied ? t("actions.copied") : t("actions.copy")}
    </button>
  );
}

function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "brand";
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/50 text-accent"
      : tone === "brand"
        ? "border-brand/50 text-brand"
        : "border-border text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function IconButton({
  label,
  onClick,
  disabled = false,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
        pressed
          ? "border-brand bg-brand/20 text-text"
          : "border-border bg-surface-2 text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

const icon = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function PlayIcon() {
  return (
    <svg {...icon} aria-hidden="true" fill="currentColor" stroke="none">
      <path d="M7 5v14l12-7z" />
    </svg>
  );
}
function SkipIcon() {
  return (
    <svg {...icon} aria-hidden="true">
      <path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none" />
      <path d="M19 5v14" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...icon} aria-hidden="true">
      <path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg {...icon} aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg {...icon} aria-hidden="true">
      {direction === "up" ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
    </svg>
  );
}
function PriorityIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg {...icon} aria-hidden="true">
      {direction === "up" ? (
        <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19l1-5.8-4.3-4.1 5.9-.9z" />
      ) : (
        <path d="M5 12h14" />
      )}
    </svg>
  );
}
