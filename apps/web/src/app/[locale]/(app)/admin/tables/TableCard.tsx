"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { VenueTableRow } from "@kj/db";
import { QrCode } from "@/components/QrCode";
import { renameTable, setTableActive, type TableActionState } from "./actions";

export function TableCard({ table, joinUrl }: { table: VenueTableRow; joinUrl: string }) {
  const t = useTranslations("admin.tables");
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<TableActionState, FormData>(renameTable, {});

  useEffect(() => {
    if (state.done) setEditing(false);
  }, [state.done]);

  return (
    <article
      className={`card flex gap-4 p-4 ${table.is_active ? "" : "opacity-60"}`}
      data-testid="table-card"
      data-active={table.is_active}
    >
      <QrCode
        value={joinUrl}
        size={96}
        label={t("qrAlt", { label: table.label })}
        className="shrink-0 rounded-lg"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {editing ? (
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="tableId" value={table.id} />
            <input
              className="input"
              name="label"
              defaultValue={table.label}
              maxLength={30}
              required
              autoFocus
              aria-label={t("label")}
            />
            {state.error && (
              <span role="alert" className="text-danger text-sm">
                {t(`errors.${state.error}`)}
              </span>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn btn-primary min-h-10 flex-1 text-sm"
                disabled={pending}
              >
                {t("save")}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10 flex-1 text-sm"
                onClick={() => setEditing(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-lg font-semibold">{table.label}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  table.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-surface-2 text-muted"
                }`}
              >
                {table.is_active ? t("active") : t("inactive")}
              </span>
            </div>
            <p className="text-sm">
              <span className="text-muted">{t("joinCode")}: </span>
              <code dir="ltr" className="font-mono text-base tracking-widest">
                {table.join_code}
              </code>
            </p>
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                className="btn btn-secondary min-h-10 flex-1 text-sm"
                onClick={() => setEditing(true)}
              >
                {t("rename")}
              </button>
              <form action={setTableActive} className="flex-1">
                <input type="hidden" name="tableId" value={table.id} />
                <input type="hidden" name="active" value={String(!table.is_active)} />
                <button type="submit" className="btn btn-secondary min-h-10 w-full text-sm">
                  {table.is_active ? t("deactivate") : t("reactivate")}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
