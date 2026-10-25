import { songKey } from "./normalize";
import type { CatalogRow } from "./normalize";

/**
 * In-memory mirror of `import_catalog_chunk` and `finish_catalog_import` for the demo venue (no
 * Supabase). Keep the semantics identical: case-insensitive match on (title, artist), values missing
 * from the file keep the catalog's, matched songs are reactivated, and deactivation only touches
 * songs this import did not see and refuses when the import saw none.
 */

export interface CatalogSong extends CatalogRow {
  id: string;
  is_active: boolean;
  last_import_id: string | null;
}

export interface ChunkResult {
  songs: CatalogSong[];
  inserted: number;
  updated: number;
}

export function mergeChunk(
  songs: readonly CatalogSong[],
  rows: readonly CatalogRow[],
  importId: string,
  newId: () => string = () => crypto.randomUUID(),
): ChunkResult {
  const next = songs.map((s) => ({ ...s }));
  const byKey = new Map<string, CatalogSong[]>();
  for (const song of next) {
    const key = songKey(song);
    byKey.set(key, [...(byKey.get(key) ?? []), song]);
  }
  const seen = new Set<string>();
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const key = songKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = byKey.get(key);
    if (matches) {
      for (const song of matches) {
        song.language = row.language ?? song.language;
        song.duration_sec = row.duration_sec ?? song.duration_sec;
        song.external_ref = row.external_ref ?? song.external_ref;
        song.is_active = true;
        song.last_import_id = importId;
      }
      updated++;
    } else {
      const song: CatalogSong = { ...row, id: newId(), is_active: true, last_import_id: importId };
      next.push(song);
      byKey.set(key, [song]);
      inserted++;
    }
  }
  return { songs: next, inserted, updated };
}

export type FinishResult =
  { ok: true; songs: CatalogSong[]; deactivated: number } | { ok: false; error: "nothingImported" };

export function finishImport(
  songs: readonly CatalogSong[],
  importId: string,
  deactivateMissing: boolean,
): FinishResult {
  if (!deactivateMissing) return { ok: true, songs: [...songs], deactivated: 0 };
  if (!songs.some((s) => s.last_import_id === importId))
    return { ok: false, error: "nothingImported" };
  let deactivated = 0;
  const next = songs.map((song) => {
    if (!song.is_active || song.last_import_id === importId) return song;
    deactivated++;
    return { ...song, is_active: false };
  });
  return { ok: true, songs: next, deactivated };
}
