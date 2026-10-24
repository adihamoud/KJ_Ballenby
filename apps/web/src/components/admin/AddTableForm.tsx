"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { initialTableActionState } from "@/lib/admin/action-state";
import { createTableAction } from "@/lib/admin/actions";
import { TABLE_LABEL_MAX } from "@/lib/admin/join-code";

/**
 * Add a table. The input is uncontrolled (text typed before hydration survives); the action
 * echoes the label back on error and bumps `version` on success, and the `key` remounts the
 * input so it shows the echo or clears.
 */
export function AddTableForm() {
  const t = useTranslations("admin.tables");
  const [state, formAction, pending] = useActionState(createTableAction, initialTableActionState);
  const labelDefault = state.error ? (state.label ?? "") : "";

  return (
    <form action={formAction} className="card flex flex-col gap-3 p-4" aria-label={t("add.title")}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">{t("add.label")}</span>
          <input
            key={`${state.version}:${labelDefault}`}
            className="input"
            name="label"
            type="text"
            autoComplete="off"
            maxLength={TABLE_LABEL_MAX}
            placeholder={t("add.placeholder")}
            defaultValue={labelDefault}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t("add.submit")}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
