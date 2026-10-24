"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { initialTableActionState } from "@/lib/admin/action-state";
import {
  regenerateJoinCodeAction,
  renameTableAction,
  setTableActiveAction,
} from "@/lib/admin/actions";
import { TABLE_LABEL_MAX } from "@/lib/admin/join-code";

interface TableRowActionsProps {
  table: { id: string; label: string; isActive: boolean };
}

/**
 * Rename, deactivate/reactivate and regenerate the join code of one table. Each is its own
 * form posting to a Server Action, so the row works before hydration too; the actions
 * revalidate the page, and the server-rendered row above updates.
 */
export function TableRowActions({ table }: TableRowActionsProps) {
  const t = useTranslations("admin.tables");
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(
    renameTableAction,
    initialTableActionState,
  );
  const [activeState, activeAction, activePending] = useActionState(
    setTableActiveAction,
    initialTableActionState,
  );
  const [codeState, codeAction, codePending] = useActionState(
    regenerateJoinCodeAction,
    initialTableActionState,
  );

  // A successful rename bumps the version: close the inline form.
  useEffect(() => {
    if (renameState.version > 0) setRenaming(false);
  }, [renameState.version]);

  const error = renameState.error ?? activeState.error ?? codeState.error;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary min-h-10 px-3 text-sm"
          onClick={() => setRenaming((v) => !v)}
          aria-expanded={renaming}
        >
          {t("rename")}
        </button>
        <form action={activeAction}>
          <input type="hidden" name="tableId" value={table.id} />
          <input type="hidden" name="active" value={table.isActive ? "0" : "1"} />
          <button
            type="submit"
            className="btn btn-secondary min-h-10 px-3 text-sm"
            disabled={activePending}
          >
            {table.isActive ? t("deactivate") : t("activate")}
          </button>
        </form>
        <form
          action={codeAction}
          onSubmit={(e) => {
            if (!window.confirm(t("confirmRegenerate", { label: table.label }))) e.preventDefault();
          }}
        >
          <input type="hidden" name="tableId" value={table.id} />
          <button
            type="submit"
            className="btn btn-secondary min-h-10 px-3 text-sm"
            disabled={codePending}
          >
            {t("regenerate")}
          </button>
        </form>
      </div>

      {renaming && (
        <form action={renameAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tableId" value={table.id} />
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{t("renameLabel")}</span>
            <input
              key={renameState.label ?? table.label}
              className="input"
              name="label"
              type="text"
              autoComplete="off"
              maxLength={TABLE_LABEL_MAX}
              defaultValue={renameState.error ? (renameState.label ?? table.label) : table.label}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="btn btn-primary min-h-10" disabled={renamePending}>
            {t("save")}
          </button>
          <button
            type="button"
            className="btn btn-secondary min-h-10"
            onClick={() => setRenaming(false)}
          >
            {t("cancel")}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
