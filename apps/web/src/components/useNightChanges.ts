"use client";

import { useEffect, useRef, useState } from "react";

export type NightConnection = "live" | "reconnecting" | "polling";

const POLL_MS = 15_000;
const REALTIME_DEBOUNCE_MS = 300;

/**
 * Keep a night view fresh: changes to the night's `queue_entries`, `song_requests` and `nights`
 * rows are only a hint to call `onRefresh` (debounced), and a slow poll covers a dropped channel
 * (docs/ARCHITECTURE.md section 4). Shared by the DJ console and the guest queue card.
 *
 * - `enabled`: poll at all (false for a client-only demo whose state would be wiped by a refetch).
 * - `realtime`: also subscribe through Supabase (live mode only).
 */
export function useNightChanges({
  nightId,
  enabled,
  realtime,
  onRefresh,
}: {
  nightId: string | null;
  enabled: boolean;
  realtime: boolean;
  onRefresh: () => void;
}): NightConnection {
  const [connection, setConnection] = useState<NightConnection>("polling");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => refreshRef.current();
    const poll = setInterval(refresh, POLL_MS);
    if (!realtime || !nightId) return () => clearInterval(poll);

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const hint = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
    };
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    import("@/lib/supabase/client").then(({ getBrowserSupabase }) => {
      if (cancelled) return;
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel(`night-${nightId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "queue_entries",
            filter: `night_id=eq.${nightId}`,
          },
          hint,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "song_requests",
            filter: `night_id=eq.${nightId}`,
          },
          hint,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "nights", filter: `id=eq.${nightId}` },
          hint,
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setConnection("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnection("reconnecting");
            hint();
          } else if (status === "CLOSED") setConnection("polling");
        });
      cleanup = () => void supabase.removeChannel(channel);
    });
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      cleanup?.();
    };
  }, [enabled, nightId, realtime]);

  return connection;
}
