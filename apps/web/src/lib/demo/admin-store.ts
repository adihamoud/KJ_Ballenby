import type { VenueTableRow } from "@kj/db";
import { DEFAULT_RULES } from "@kj/queue-engine";
import type { QueueRulesConfig } from "@kj/queue-engine";
import { DEMO_TABLES, DEMO_VENUE_ID } from "./venue";

/**
 * In-memory venue for the admin pages when Supabase is not configured (local preview without
 * secrets, CI's Playwright run). One sandbox per browser, keyed by a random id the first
 * admin action stores in a cookie, so parallel e2e workers never see each other's tables.
 * A browser that has not changed anything yet reads the seed straight from `lib/demo/venue`.
 */

export interface DemoVenueState {
  venue: { id: string; slug: string; name: string };
  tables: VenueTableRow[];
  rules: QueueRulesConfig;
}

const MAX_SANDBOXES = 500;
const TTL_MS = 12 * 60 * 60 * 1000;

interface Stored {
  state: DemoVenueState;
  touchedAt: number;
}

// On globalThis for the same reason as the demo night store: Server Actions and pages are
// bundled separately, so a module-scoped Map would exist twice per process.
const GLOBAL_KEY = "__kjDemoVenues" as const;
type DemoGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, Stored> };
const demoGlobal = globalThis as DemoGlobal;
const sandboxes: Map<string, Stored> = (demoGlobal[GLOBAL_KEY] ??= new Map<string, Stored>());

/** The venue as `supabase/seed.sql` creates it; the QR token of a demo table is its id. */
export function seedDemoVenue(now: Date = new Date()): DemoVenueState {
  const first = DEMO_TABLES[0];
  const createdAt = now.toISOString();
  return {
    venue: {
      id: DEMO_VENUE_ID,
      slug: first?.venue_slug ?? "demo-bar",
      name: first?.venue_name ?? "Demo Karaoke Bar",
    },
    tables: DEMO_TABLES.map((t) => ({
      id: t.table_id,
      venue_id: t.venue_id,
      label: t.table_label,
      join_code: t.join_code,
      qr_token: t.table_id,
      is_active: true,
      created_at: createdAt,
      updated_at: createdAt,
    })),
    rules: { ...DEFAULT_RULES },
  };
}

function evict(now: number) {
  for (const [key, stored] of sandboxes) {
    if (now - stored.touchedAt > TTL_MS) sandboxes.delete(key);
  }
  while (sandboxes.size > MAX_SANDBOXES) {
    const oldest = sandboxes.keys().next().value;
    if (oldest === undefined) break;
    sandboxes.delete(oldest);
  }
}

/** The sandbox for this browser, or the untouched seed when it has none (or none yet). */
export function getDemoVenue(sandboxId: string | null, now: Date = new Date()): DemoVenueState {
  if (!sandboxId) return seedDemoVenue(now);
  const stored = sandboxes.get(sandboxId);
  if (!stored) return seedDemoVenue(now);
  stored.touchedAt = now.getTime();
  sandboxes.delete(sandboxId); // re-insert so Map order doubles as LRU order
  sandboxes.set(sandboxId, stored);
  return stored.state;
}

export function setDemoVenue(
  sandboxId: string,
  state: DemoVenueState,
  now: Date = new Date(),
): void {
  sandboxes.delete(sandboxId);
  sandboxes.set(sandboxId, { state, touchedAt: now.getTime() });
  evict(now.getTime());
}

/** Test hook: forget every sandbox. */
export function resetDemoVenues(): void {
  sandboxes.clear();
}
