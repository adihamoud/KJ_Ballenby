import { demoSnapshot } from "@/lib/dj/demo-night";
import type { DjSnapshot } from "@/lib/dj/types";

/**
 * In-memory demo night, used when Supabase is not configured (local preview without secrets,
 * CI's Playwright run). One night per `guestId` (the random id in the guest cookie), so every
 * browser gets its own sandbox: the guest requests a song, and the DJ console opened in the
 * same browser shows it. Nothing survives a server restart, which is the point.
 */

const MAX_NIGHTS = 500;
const TTL_MS = 12 * 60 * 60 * 1000;

interface Stored {
  snapshot: DjSnapshot;
  touchedAt: number;
}

// Kept on globalThis, not in module scope: Next.js bundles Server Actions separately from the
// pages that render, so this module is instantiated twice per process (plus dev HMR reloads).
// The guest action writes here and the guest page and DJ console read it, so they must share it.
const GLOBAL_KEY = "__kjDemoNights" as const;
type DemoGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, Stored> };
const demoGlobal = globalThis as DemoGlobal;
const nights: Map<string, Stored> = (demoGlobal[GLOBAL_KEY] ??= new Map<string, Stored>());

function evict(now: number) {
  for (const [key, stored] of nights) {
    if (now - stored.touchedAt > TTL_MS) nights.delete(key);
  }
  while (nights.size > MAX_NIGHTS) {
    const oldest = nights.keys().next().value;
    if (oldest === undefined) break;
    nights.delete(oldest);
  }
}

/** The demo night for this browser, seeded from the fixed demo evening on first use. */
export function getDemoNight(guestId: string, now: Date = new Date()): DjSnapshot {
  const stored = nights.get(guestId);
  if (stored) {
    stored.touchedAt = now.getTime();
    nights.delete(guestId); // re-insert so Map order doubles as LRU order for reads too
    nights.set(guestId, stored);
    return stored.snapshot;
  }
  const snapshot: DjSnapshot = { ...demoSnapshot(now), persisted: true };
  nights.set(guestId, { snapshot, touchedAt: now.getTime() });
  evict(now.getTime());
  return snapshot;
}

export function setDemoNight(guestId: string, snapshot: DjSnapshot, now: Date = new Date()): void {
  nights.delete(guestId); // re-insert so Map order doubles as LRU order
  nights.set(guestId, { snapshot: { ...snapshot, persisted: true }, touchedAt: now.getTime() });
  evict(now.getTime());
}

/** Test hook: forget every demo night. */
export function resetDemoNights(): void {
  nights.clear();
}
