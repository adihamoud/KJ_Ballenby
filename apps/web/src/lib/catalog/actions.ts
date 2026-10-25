"use server";

import { revalidatePath } from "next/cache";
import type { CatalogImportStats, Json } from "@kj/db";
import { ensureDemoSandboxId } from "@/lib/admin/demo-sandbox";
import { loadAdminVenue } from "@/lib/admin/venue";
import type { AdminVenue } from "@/lib/admin/venue";
import { getDemoVenue, setDemoVenue } from "@/lib/demo/admin-store";
import type { DemoVenueState } from "@/lib/demo/admin-store";
import { createServerSupabase } from "@/lib/supabase/server";
import { MAX_CHUNK_ROWS, UPLOAD_CONTENT_TYPES } from "./action-state";
import type {
  CatalogImportError,
  CatalogStartInput,
  CatalogStartResult,
  CatalogStepResult,
} from "./action-state";
import { readImportStats } from "./load";
import { finishImport, mergeChunk } from "./merge";
import { sanitizeRow } from "./normalize";
import type { CatalogRow } from "./normalize";
import { MAX_ROWS } from "./parse";

/**
 * Server Actions behind `/admin/catalog` (ADR-010). The browser parses the file and calls
 * `startCatalogImportAction`, then `importCatalogChunkAction` per chunk, then
 * `finishCatalogImportAction`, or `failCatalogImportAction` when a step fails. Every write runs
 * as the signed-in admin under RLS; rows are sanitized again here because they come from the
 * client. Without Supabase the demo venue of this browser's sandbox is edited instead.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = new Set(["csv", "vdj-database", "vdj-folder"]);
const FILE_NAME_MAX = 200;
const UNIQUE_VIOLATION = "23505";
/** A "processing" import untouched for this long is treated as abandoned (tab closed mid-import). */
const STALE_MS = 15 * 60 * 1000;

type Gate = { ok: true; venue: AdminVenue } | { ok: false; error: CatalogImportError };

async function gate(): Promise<Gate> {
  const loaded = await loadAdminVenue();
  if (loaded.ok) return loaded;
  return { ok: false, error: loaded.reason === "unavailable" ? "unavailable" : "notAdmin" };
}

function refresh() {
  revalidatePath("/[locale]/admin", "layout");
}

function count(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10 * MAX_ROWS
    ? value
    : 0;
}

async function demoUpdate<T>(mutate: (state: DemoVenueState) => T): Promise<T> {
  const sandboxId = await ensureDemoSandboxId();
  const state = structuredClone(getDemoVenue(sandboxId));
  const result = mutate(state);
  setDemoVenue(sandboxId, state);
  return result;
}

function storagePathValid(venueId: string, path: string): boolean {
  const [folder, name, ...rest] = path.split("/");
  if (folder !== venueId || !name || rest.length > 0) return false;
  const dot = name.lastIndexOf(".");
  const id = name.slice(0, dot);
  const ext = name.slice(dot + 1);
  return dot > 0 && UUID_RE.test(id) && Object.hasOwn(UPLOAD_CONTENT_TYPES, ext);
}

/** Create the `catalog_imports` row (status `processing`) for a file the browser parsed. */
export async function startCatalogImportAction(
  input: CatalogStartInput,
): Promise<CatalogStartResult> {
  if (!FORMATS.has(input.format)) return { ok: false, error: "invalid" };
  const stats: CatalogImportStats = {
    file: String(input.fileName ?? "").slice(0, FILE_NAME_MAX),
    format: input.format,
    total: count(input.total),
    skipped: count(input.skipped),
    duplicates: count(input.duplicates),
  };

  const gated = await gate();
  if (!gated.ok) return gated;
  const { venue } = gated;
  const now = new Date();

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    return demoUpdate((state) => {
      const busy = state.imports.some(
        (i) => i.status === "processing" && now.getTime() - Date.parse(i.created_at) < STALE_MS,
      );
      if (busy) return { ok: false, error: "busy" } as const;
      const id = crypto.randomUUID();
      state.imports.unshift({
        id,
        status: "processing",
        stats,
        error: null,
        created_at: now.toISOString(),
      });
      return { ok: true, importId: id } as const;
    });
  }

  if (!input.storagePath || !storagePathValid(venue.id, input.storagePath)) {
    return { ok: false, error: "invalid" };
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "notAdmin" };

  // One import at a time per venue: "deactivate missing" of one would switch off the other's songs.
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();
  const abandoned = await supabase
    .from("catalog_imports")
    .update({ status: "failed", error: "abandoned" })
    .eq("venue_id", venue.id)
    .eq("status", "processing")
    .lt("updated_at", staleBefore);
  if (abandoned.error) return failed("expire catalog_imports", abandoned.error.message);
  const running = await supabase
    .from("catalog_imports")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venue.id)
    .eq("status", "processing");
  if (running.error) return failed("count catalog_imports", running.error.message);
  if ((running.count ?? 0) > 0) return { ok: false, error: "busy" };

  const { data, error } = await supabase
    .from("catalog_imports")
    .insert({
      venue_id: venue.id,
      uploaded_by: auth.user.id,
      storage_path: input.storagePath,
      status: "processing",
      stats: stats as Json,
    })
    .select("id")
    .single();
  // A second tab that passed the count above loses on `catalog_imports_one_processing`.
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "busy" };
  if (error) return failed("insert catalog_imports", error.message);
  return { ok: true, importId: data.id };
}

/** Upsert one chunk of rows; returns the import's running totals. */
export async function importCatalogChunkAction(
  importId: string,
  rows: unknown,
): Promise<CatalogStepResult> {
  if (!UUID_RE.test(importId) || !Array.isArray(rows) || rows.length > MAX_CHUNK_ROWS) {
    return { ok: false, error: "invalid" };
  }
  // Authorize before touching row contents: sanitizing runs regexes over caller-controlled text.
  const gated = await gate();
  if (!gated.ok) return gated;
  const { venue } = gated;

  const clean: CatalogRow[] = [];
  let rejected = 0;
  for (const row of rows) {
    const sanitized = sanitizeRow(row);
    if (sanitized) clean.push(sanitized);
    else rejected++;
  }

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    return demoUpdate((state) => {
      const entry = state.imports.find((i) => i.id === importId);
      if (!entry || entry.status !== "processing") return { ok: false, error: "notFound" } as const;
      const merged = mergeChunk(state.songs, clean, importId);
      state.songs = merged.songs;
      entry.stats = {
        ...entry.stats,
        inserted: (entry.stats.inserted ?? 0) + merged.inserted,
        updated: (entry.stats.updated ?? 0) + merged.updated,
        skipped:
          (entry.stats.skipped ?? 0) + rejected + (clean.length - merged.inserted - merged.updated),
      };
      return { ok: true, stats: entry.stats } as const;
    });
  }

  const { data, error } = await supabase.rpc("import_catalog_chunk", {
    p_import_id: importId,
    p_rows: clean as unknown as Json,
  });
  if (error) return rpcFailed("import_catalog_chunk", error);
  // The browser runs the same sanitizer before sending, so `rejected` is only non-zero for a
  // tampered client; those rows are dropped without being counted.
  return { ok: true, stats: readImportStats(data) };
}

/** Optionally deactivate songs the file did not contain, then mark the import done. */
export async function finishCatalogImportAction(
  importId: string,
  deactivateMissing: boolean,
): Promise<CatalogStepResult> {
  if (!UUID_RE.test(importId)) return { ok: false, error: "invalid" };
  const gated = await gate();
  if (!gated.ok) return gated;
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const result = await demoUpdate((state) => {
      const entry = state.imports.find((i) => i.id === importId);
      if (!entry || entry.status !== "processing") return { ok: false, error: "notFound" } as const;
      const finished = finishImport(state.songs, importId, deactivateMissing === true);
      if (!finished.ok) return finished;
      state.songs = finished.songs;
      entry.status = "done";
      entry.stats = { ...entry.stats, deactivated: finished.deactivated };
      return { ok: true, stats: entry.stats } as const;
    });
    if (result.ok) refresh();
    return result;
  }

  const { data, error } = await supabase.rpc("finish_catalog_import", {
    p_import_id: importId,
    p_deactivate_missing: deactivateMissing === true,
  });
  if (error) return rpcFailed("finish_catalog_import", error);
  refresh();
  return { ok: true, stats: readImportStats(data) };
}

/** Record why the browser gave up on an import, so it shows as failed in the history. */
export async function failCatalogImportAction(
  importId: string,
  reason: CatalogImportError,
): Promise<void> {
  if (!UUID_RE.test(importId)) return;
  const error = /^[a-zA-Z]{1,32}$/.test(reason) ? reason : "unavailable";
  const gated = await gate();
  if (!gated.ok) return;
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    await demoUpdate((state) => {
      const entry = state.imports.find((i) => i.id === importId);
      if (entry?.status === "processing") {
        entry.status = "failed";
        entry.error = error;
      }
    });
  } else {
    const update = await supabase
      .from("catalog_imports")
      .update({ status: "failed", error })
      .eq("id", importId)
      .eq("status", "processing");
    if (update.error)
      console.error("admin catalog: fail import failed", { message: update.error.message });
  }
  refresh();
}

function failed(step: string, message: string): { ok: false; error: CatalogImportError } {
  console.error(`admin catalog: ${step} failed`, { message });
  return { ok: false, error: "unavailable" };
}

function rpcFailed(
  fn: string,
  error: { code?: string; message: string },
): { ok: false; error: CatalogImportError } {
  if (error.code === "P0002") return { ok: false, error: "notFound" };
  if (error.code === "22023" && error.message.includes("refusing to deactivate")) {
    return { ok: false, error: "nothingImported" };
  }
  if (error.code === "22023") return { ok: false, error: "notFound" };
  return failed(fn, error.message);
}
