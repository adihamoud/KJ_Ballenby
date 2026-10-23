"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GuestQueueView } from "@/lib/guest/request-model";

interface GuestNightContextValue {
  view: GuestQueueView;
  /** Adopt a fresher view (ignored when older than the current one). */
  setView: (view: GuestQueueView) => void;
}

const GuestNightContext = createContext<GuestNightContextValue | null>(null);

/**
 * The guest's view of the night, shared by the queue card and the request sheet so a request
 * response updates the card directly instead of re-rendering the whole page.
 */
export function GuestNightProvider({
  initial,
  children,
}: {
  initial: GuestQueueView;
  children: React.ReactNode;
}) {
  const [view, setViewState] = useState(initial);
  const viewRef = useRef(view);
  viewRef.current = view;

  const setView = useCallback((next: GuestQueueView) => {
    if (next.generatedAt >= viewRef.current.generatedAt) setViewState(next);
  }, []);

  // A server re-render (navigation, revalidation) may carry a newer snapshot.
  useEffect(() => setView(initial), [initial, setView]);

  return (
    <GuestNightContext.Provider value={{ view, setView }}>{children}</GuestNightContext.Provider>
  );
}

export function useGuestNight(): GuestNightContextValue {
  const value = useContext(GuestNightContext);
  if (!value) throw new Error("useGuestNight must be used inside GuestNightProvider");
  return value;
}

/** Like `useGuestNight`, but null outside a provider (catalog browsing without a night). */
export function useOptionalGuestNight(): GuestNightContextValue | null {
  return useContext(GuestNightContext);
}
