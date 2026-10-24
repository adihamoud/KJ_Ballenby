"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useNightChanges, type NightConnection } from "@/components/useNightChanges";
import { closeNight, openNight, performHostAction, refreshDjSnapshot } from "@/lib/dj/actions";
import type { DjActionResponse } from "@/lib/dj/actions";
import { demoSnapshot } from "@/lib/dj/demo-night";
import { applyHostAction, closeNightSnapshot } from "@/lib/dj/queue-model";
import type { DjNight, DjSnapshot, HostAction } from "@/lib/dj/types";

export type DjErrorKey = Extract<DjActionResponse, { ok: false }>["error"];

export interface DjNightState {
  snapshot: DjSnapshot;
  /** The open night, or null when no night is open. */
  night: DjNight | null;
  isLive: boolean;
  connection: NightConnection;
  error: DjErrorKey | null;
  clearError: () => void;
  /** True while a server action or refresh is in flight. */
  pending: boolean;
  /** Apply a host action optimistically, then persist it (live or stored demo night). */
  run: (action: HostAction) => void;
  /** Close the open night (after a confirm) or open a new one. */
  toggleNight: () => void;
}

/**
 * The night as a host sees it, shared by the DJ console and the venue admin's queue page.
 *
 * State is one `DjSnapshot`. Host actions are applied optimistically with the same pure model
 * the server uses, then (in live mode) sent to the server action whose response replaces the
 * snapshot. Realtime events and a slow poll only trigger refetches, never local patches
 * (docs/ARCHITECTURE.md section 4).
 */
export function useDjNight(initial: DjSnapshot): DjNightState {
  const t = useTranslations("dj");
  const [snapshot, setSnapshot] = useState(initial);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [error, setError] = useState<DjErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const isLive = snapshot.mode === "live";
  const persisted = snapshot.persisted;
  const night = snapshot.night?.status === "open" ? snapshot.night : null;

  // Ordering guard: a host action's response replaces the snapshot only if no newer action was
  // sent meanwhile, and refreshes (poll, realtime hint) are dropped while actions are in flight.
  // Otherwise a slow response or a refresh started before the click re-renders the pre-action
  // state and the host's next tap lands on a stale card.
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

  const clearError = useCallback(() => setError(null), []);

  return {
    snapshot,
    night,
    isLive,
    connection,
    error,
    clearError,
    pending,
    run,
    toggleNight,
  };
}
