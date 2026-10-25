import { parseCsv } from "./csv";
import { songKey, toCatalogRow } from "./normalize";
import type { CatalogRow, RawSong } from "./normalize";
import { detectVirtualDj, parseVirtualDj } from "./virtualdj";

export type CatalogFormat = "csv" | "vdj-database" | "vdj-folder";

/** The bucket's own limit (`catalog-imports`, 25 MB). */
export const MAX_FILE_BYTES = 26_214_400;
export const MAX_ROWS = 50_000;
/** Rows per Server Action call; keeps each request far below the 1 MB action body limit. */
export const CHUNK_SIZE = 500;

export type CatalogParseError =
  "empty" | "tooLarge" | "noTitleColumn" | "unknownXml" | "tooManyRows";

export interface ParsedCatalog {
  format: CatalogFormat;
  rows: CatalogRow[];
  /** Entries in the file, before skipping and de-duplication. */
  total: number;
  /** Entries without a usable title or artist. */
  skipped: number;
  /** Entries that repeat an earlier (title, artist), ignoring case. */
  duplicates: number;
}

export type CatalogParseResult =
  { ok: true; catalog: ParsedCatalog } | { ok: false; error: CatalogParseError };

/**
 * Text from file bytes: UTF-8 (with or without BOM) or UTF-16 with a BOM, and Windows-1255 for
 * the Hebrew CSVs older Excel versions save, detected by the bytes not being valid UTF-8.
 */
export function decodeCatalogBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}

/** Clean, skip and de-duplicate (first occurrence wins) raw songs from any format. */
export function collectRows(format: CatalogFormat, songs: readonly RawSong[]): CatalogParseResult {
  const rows: CatalogRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  for (const song of songs) {
    const row = toCatalogRow(song);
    if (!row) {
      skipped++;
      continue;
    }
    const key = songKey(row);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  if (rows.length > MAX_ROWS) return { ok: false, error: "tooManyRows" };
  return { ok: true, catalog: { format, rows, total: songs.length, skipped, duplicates } };
}

/** Parse an uploaded catalog: VirtualDJ XML is recognized by its root element, anything else is CSV. */
export function parseCatalogText(text: string): CatalogParseResult {
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) return { ok: false, error: "empty" };
  if (body.trimStart().startsWith("<")) {
    const format = detectVirtualDj(body);
    if (!format) return { ok: false, error: "unknownXml" };
    return collectRows(format, parseVirtualDj(body, format));
  }
  const csv = parseCsv(body);
  if (!csv.ok) return csv;
  return collectRows("csv", csv.songs);
}

export function parseCatalogBytes(bytes: Uint8Array): CatalogParseResult {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };
  return parseCatalogText(decodeCatalogBytes(bytes));
}

export function chunkRows<T>(rows: readonly T[], size = CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}
