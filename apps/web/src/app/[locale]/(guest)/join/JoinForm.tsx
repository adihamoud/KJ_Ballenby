"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { joinTableAction } from "@/lib/guest/actions";
import { initialJoinState } from "@/lib/guest/join-state";
import { GUEST_NAME_MAX } from "@/lib/guest/join-code";

interface JoinFormProps {
  locale: string;
  /** Prefilled table code; when `lockedCode` is set the field is hidden (QR flow). */
  code?: string;
  lockedCode?: string;
  name?: string;
}

export function JoinForm({ locale, code = "", lockedCode, name = "" }: JoinFormProps) {
  const t = useTranslations("join");
  const [state, formAction, pending] = useActionState(joinTableAction, initialJoinState);
  // Controlled so React's post-action form reset does not wipe what the guest typed on error.
  const [codeValue, setCodeValue] = useState(code);
  const [nameValue, setNameValue] = useState(name);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="locale" value={locale} />

      {lockedCode ? (
        <input type="hidden" name="code" value={lockedCode} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("codeLabel")}</span>
          <input
            className="input text-center text-2xl tracking-[0.3em] uppercase"
            name="code"
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={36}
            placeholder={t("codePlaceholder")}
            value={codeValue}
            onChange={(e) => setCodeValue(e.target.value)}
            required
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("nameLabel")}</span>
        <input
          className="input"
          name="name"
          type="text"
          autoComplete="nickname"
          maxLength={GUEST_NAME_MAX}
          placeholder={t("namePlaceholder")}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          required
        />
      </label>

      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {lockedCode ? t("confirmSubmit") : t("submit")}
      </button>
    </form>
  );
}
