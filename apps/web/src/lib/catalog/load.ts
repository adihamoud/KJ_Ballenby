import type { CatalogImportStats, ImportStatus, Json } from "@kj/db";
import type { AdminVenue } from "@/lib/admin/venue";
import { readDemoSandboxId } from "@/lib/admin/demo-sandbox";
import { getDemoVenue } from "@/lib/demo/admin-store";
import { createServerSupabase } from "@/lib/supabase/server";

export interface CatalogImportSummary {
  id: string;
  status: ImportStatus;
  stats: CatalogImportStats;
  error: string | null;
  createdAt: string;
}

export interface CatalogOverview {
  active: number;
  inactive: number;
  imports: CatalogImportSummary[];
}

export type CatalogOverviewResult =
  { ok: true; overview: CatalogOverview } | { ok: false; reason: "unavailable" };

const HISTORY_LIMIT = 10;
const STAT_KEYS = ["total", "duplicates", "skipped", "inserted", "updated", "deactivated"] as const;

/** `catalog_imports.stats` as typed fields; unknown or malformed values are dropped. */
export function readImportStats(value: Json): CatalogImportStats {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const stats: CatalogImportStats = {};
  for (const key of STAT_KEYS) {
    const n = value[key];
    if (typeof n === "number" && Number.isFinite(n)) stats[key] = n;
  }
  if (typeof value.file === "string") stats.file = value.file;
  if (typeof value.format === "string") stats.format = value.format;
  return stats;
}

/** Song counts and the latest imports of the venue, for `/admin/catalog`. */
export async function loadCatalogOverview(venue: AdminVenue): Promise<CatalogOverviewResult> {
  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const state = getDemoVenue(await readDemoSandboxId());
    const active = state.songs.filter((s) => s.is_active).length;
    return {
      ok: true,
      overview: {
        active,
        inactive: state.songs.length - active,
        imports: state.imports.slice(0, HISTORY_LIMIT).map((i) => ({
          id: i.id,
          status: i.status,
          stats: i.stats,
          error: i.error,
          createdAt: i.created_at,
        })),
      },
    };
  }

  const count = (active: boolean) =>
    supabase
      .from("songs")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venue.id)
      .eq("is_active", active);
  const [activeRes, inactiveRes, importsRes] = await Promise.all([
    count(true),
    count(false),
    supabase
      .from("catalog_imports")
      .select("id, status, stats, error, created_at")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const failed = activeRes.error ?? inactiveRes.error ?? importsRes.error;
  if (failed) {
    console.error("admin catalog: overview query failed", { message: failed.message });
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    overview: {
      active: activeRes.count ?? 0,
      inactive: inactiveRes.count ?? 0,
      imports: (importsRes.data ?? []).map((i) => ({
        id: i.id,
        status: i.status,
        stats: readImportStats(i.stats),
        error: i.error,
        createdAt: i.created_at,
      })),
    },
  };
}
