"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createGroup, type CreateGroupState } from "./actions";

export function CreateGroupForm({ tableId }: { tableId: string | null }) {
  const t = useTranslations("app");
  const [state, action, pending] = useActionState<CreateGroupState, FormData>(createGroup, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tableId" value={tableId ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("createGroup.nameLabel")}</span>
        <input
          className="input"
          name="name"
          maxLength={40}
          required
          placeholder={t("createGroup.namePlaceholder")}
          autoComplete="off"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t("createGroup.submit")}
      </button>
    </form>
  );
}
