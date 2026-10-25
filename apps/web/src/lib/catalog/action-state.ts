import type { CatalogImportStats } from "@kj/db";
import type { CatalogFormat } from "./parse";

/** Why a catalog import step failed; each has a message under `admin.catalog.errors`. */
export type CatalogImportError =
  "notAdmin" | "unavailable" | "busy" | "invalid" | "notFound" | "nothingImported" | "upload";

export type CatalogStepResult =
  { ok: true; stats: CatalogImportStats } | { ok: false; error: CatalogImportError };

export type CatalogStartResult =
  { ok: true; importId: string } | { ok: false; error: CatalogImportError };

export interface CatalogStartInput {
  /** `<venue_id>/<uuid>.<ext>` in the `catalog-imports` bucket; null in demo mode (no Storage). */
  storagePath: string | null;
  fileName: string;
  format: CatalogFormat;
  total: number;
  skipped: number;
  duplicates: number;
}

/** File extensions the bucket accepts, with the content type each upload is sent as. */
export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
  xml: "application/xml",
  vdjfolder: "application/xml",
};

/** Rows per chunk the server accepts; matches the limit in `import_catalog_chunk`. */
export const MAX_CHUNK_ROWS = 1000;
