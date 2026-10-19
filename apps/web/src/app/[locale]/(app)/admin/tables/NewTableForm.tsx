"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { createTable, type TableActionState } from "./actions";

export function NewTableForm({ venueId }: { venueId: string }) {
  const t = useTranslations("admin.tables");
  const [state, action, pending] = useActionState<TableActionState, FormData>(createTable, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state.done]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <input type="hidden" name="venueId" value={venueId} />
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="sr-only">{t("label")}</span>
        <input
          className="input"
          name="label"
          maxLength={30}
          required
          placeholder={t("newLabelPlaceholder")}
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
        />
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {t(`errors.${state.error}`)}
          </span>
        )}
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t("add")}
      </button>
    </form>
  );
}
