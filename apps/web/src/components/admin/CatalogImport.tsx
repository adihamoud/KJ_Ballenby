"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CatalogImportStats } from "@kj/db";
import {
  failCatalogImportAction,
  finishCatalogImportAction,
  importCatalogChunkAction,
  startCatalogImportAction,
} from "@/lib/catalog/actions";
import { UPLOAD_CONTENT_TYPES } from "@/lib/catalog/action-state";
import type { CatalogImportError } from "@/lib/catalog/action-state";
import { CSV_TEMPLATE } from "@/lib/catalog/csv";
import { chunkRows, MAX_FILE_BYTES, parseCatalogBytes } from "@/lib/catalog/parse";
import type { CatalogParseError, ParsedCatalog } from "@/lib/catalog/parse";
import { getBrowserSupabase } from "@/lib/supabase/client";

const BUCKET = "catalog-imports";
const PREVIEW_ROWS = 5;
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${CSV_TEMPLATE}`)}`;

type Phase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "ready"; file: File; catalog: ParsedCatalog }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; stats: CatalogImportStats }
  | { kind: "error"; error: CatalogParseError | CatalogImportError | "unreadable" };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Upload flow of `/admin/catalog`: the file is parsed here (so a 20 MB VirtualDJ database never
 * goes through a Server Action body), previewed, kept in Storage for reference, and then sent in
 * chunks of clean rows (ADR-010).
 */
export function CatalogImport({ venueId, mode }: { venueId: string; mode: "live" | "demo" }) {
  const t = useTranslations("admin.catalog");
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [deactivate, setDeactivate] = useState(false);

  function reset() {
    setPhase({ kind: "idle" });
    setDeactivate(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setPhase({ kind: "error", error: "tooLarge" });
      return;
    }
    setPhase({ kind: "parsing" });
    try {
      const result = parseCatalogBytes(new Uint8Array(await file.arrayBuffer()));
      setPhase(
        result.ok
          ? { kind: "ready", file, catalog: result.catalog }
          : { kind: "error", error: result.error },
      );
    } catch {
      setPhase({ kind: "error", error: "unreadable" });
    }
  }

  async function runImport(file: File, catalog: ParsedCatalog) {
    const total = catalog.rows.length;
    setPhase({ kind: "importing", done: 0, total });

    let storagePath: string | null = null;
    if (mode === "live") {
      const given = extensionOf(file.name);
      const ext = Object.hasOwn(UPLOAD_CONTENT_TYPES, given)
        ? given
        : catalog.format === "csv"
          ? "csv"
          : "xml";
      storagePath = `${venueId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await getBrowserSupabase()
        .storage.from(BUCKET)
        .upload(storagePath, file, { contentType: UPLOAD_CONTENT_TYPES[ext], upsert: false });
      if (error) {
        console.error("catalog upload failed", { message: error.message });
        setPhase({ kind: "error", error: "upload" });
        return;
      }
    }

    let importId: string | null = null;
    try {
      const started = await startCatalogImportAction({
        storagePath,
        fileName: file.name,
        format: catalog.format,
        total: catalog.total,
        skipped: catalog.skipped,
        duplicates: catalog.duplicates,
      });
      if (!started.ok) {
        setPhase({ kind: "error", error: started.error });
        return;
      }
      importId = started.importId;

      let done = 0;
      for (const chunk of chunkRows(catalog.rows)) {
        const step = await importCatalogChunkAction(importId, chunk);
        if (!step.ok) {
          await failCatalogImportAction(importId, step.error);
          setPhase({ kind: "error", error: step.error });
          router.refresh();
          return;
        }
        done += chunk.length;
        setPhase({ kind: "importing", done, total });
      }

      const finished = await finishCatalogImportAction(importId, deactivate);
      if (!finished.ok) {
        await failCatalogImportAction(importId, finished.error);
        setPhase({ kind: "error", error: finished.error });
      } else {
        setPhase({ kind: "done", stats: finished.stats });
      }
      router.refresh();
    } catch {
      // A thrown action (network drop, oversized chunk) must not leave the import "processing",
      // which would block new imports for this venue until it times out.
      if (importId) await failCatalogImportAction(importId, "unavailable").catch(() => undefined);
      setPhase({ kind: "error", error: "unavailable" });
      router.refresh();
    }
  }

  const busy = phase.kind === "parsing" || phase.kind === "importing";

  return (
    <section className="card flex flex-col gap-4 p-5" data-testid="catalog-import">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("upload.title")}</h2>
        <p className="text-muted text-sm">{t("upload.formats")}</p>
        <p className="text-muted text-sm">{t("upload.vdjHint")}</p>
      </div>

      {(phase.kind === "idle" || phase.kind === "parsing" || phase.kind === "error") && (
        <div className="flex flex-col gap-3">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t("upload.file")}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,.txt,.xml,.vdjfolder,text/csv,application/xml,text/xml"
            className="input"
            disabled={busy}
            data-testid="catalog-file"
            onChange={(e) => void onFile(e.currentTarget.files?.[0])}
          />
          <a
            href={TEMPLATE_HREF}
            download="catalog-template.csv"
            className="text-muted self-start text-sm underline"
          >
            {t("upload.template")}
          </a>
          {phase.kind === "parsing" && (
            <p className="text-muted text-sm" role="status">
              {t("upload.parsing")}
            </p>
          )}
        </div>
      )}

      {phase.kind === "error" && (
        <p className="text-danger text-sm" role="alert" data-testid="catalog-error">
          {t(`errors.${phase.error}`)}
        </p>
      )}

      {phase.kind === "ready" && (
        <div className="flex flex-col gap-4" data-testid="catalog-preview">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{t("preview.title")}</h3>
            <p className="text-sm">
              <bdi className="font-medium">{phase.file.name}</bdi>
              {" · "}
              {t(`preview.format.${phase.catalog.format}`)}
            </p>
            <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <li data-testid="catalog-found">
                {t("preview.found", { count: phase.catalog.rows.length })}
              </li>
              {phase.catalog.skipped > 0 && (
                <li>{t("preview.skipped", { count: phase.catalog.skipped })}</li>
              )}
              {phase.catalog.duplicates > 0 && (
                <li>{t("preview.duplicates", { count: phase.catalog.duplicates })}</li>
              )}
            </ul>
          </div>

          {phase.catalog.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <caption className="text-muted pb-1 text-start text-xs">
                  {t("preview.sample")}
                </caption>
                <thead>
                  <tr className="text-muted">
                    <th className="pe-3 text-start font-medium">{t("preview.columns.title")}</th>
                    <th className="pe-3 text-start font-medium">{t("preview.columns.artist")}</th>
                    <th className="pe-3 text-start font-medium">{t("preview.columns.language")}</th>
                    <th className="text-start font-medium">{t("preview.columns.duration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {phase.catalog.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={`${row.title}\u0000${row.artist}`} className="border-border border-t">
                      <td className="py-1 pe-3">
                        <bdi>{row.title}</bdi>
                      </td>
                      <td className="py-1 pe-3">
                        <bdi>{row.artist}</bdi>
                      </td>
                      <td className="py-1 pe-3">{row.language ?? ""}</td>
                      <td className="py-1" dir="ltr">
                        {formatDuration(row.duration_sec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={deactivate}
              onChange={(e) => setDeactivate(e.currentTarget.checked)}
              data-testid="catalog-deactivate"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("preview.deactivate")}</span>
              <span className="text-muted text-sm">{t("preview.deactivateHint")}</span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={phase.catalog.rows.length === 0}
              onClick={() => void runImport(phase.file, phase.catalog)}
              data-testid="catalog-submit"
            >
              {t("preview.submit", { count: phase.catalog.rows.length })}
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              {t("preview.another")}
            </button>
          </div>
        </div>
      )}

      {phase.kind === "importing" && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm">{t("progress", { done: phase.done, total: phase.total })}</p>
          <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
            <div
              className="bg-brand-2 h-full transition-[width]"
              style={{
                width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="flex flex-col gap-3" data-testid="catalog-result">
          <h3 className="font-semibold" role="status">
            {t("result.title")}
          </h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <li data-testid="catalog-inserted">
              {t("result.inserted", { count: phase.stats.inserted ?? 0 })}
            </li>
            <li data-testid="catalog-updated">
              {t("result.updated", { count: phase.stats.updated ?? 0 })}
            </li>
            {(phase.stats.deactivated ?? 0) > 0 && (
              <li data-testid="catalog-deactivated">
                {t("result.deactivated", { count: phase.stats.deactivated ?? 0 })}
              </li>
            )}
            {(phase.stats.skipped ?? 0) > 0 && (
              <li>{t("result.skipped", { count: phase.stats.skipped ?? 0 })}</li>
            )}
          </ul>
          <button type="button" className="btn btn-secondary self-start" onClick={reset}>
            {t("result.again")}
          </button>
        </div>
      )}
    </section>
  );
}
