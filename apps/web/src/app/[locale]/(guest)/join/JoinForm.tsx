"use client";

import { useActionState } from "react";
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

/**
 * The inputs are deliberately uncontrolled. A guest on a slow phone starts typing before React
 * has hydrated, and a controlled input would reset to its initial state at hydration, wiping
 * the code and silently failing the `required` check on submit. React resets uncontrolled
 * fields to `defaultValue` after each action, so the action echoes the submission back in its
 * state and the defaults follow it; the `key` remounts the inputs so the new defaults apply.
 */
export function JoinForm({ locale, code = "", lockedCode, name = "" }: JoinFormProps) {
  const t = useTranslations("join");
  const [state, formAction, pending] = useActionState(joinTableAction, initialJoinState);
  const codeDefault = state.code ?? code;
  const nameDefault = state.name ?? name;
  const fieldKey = `${codeDefault}\u0000${nameDefault}`;

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="locale" value={locale} />

      {lockedCode ? (
        <input type="hidden" name="code" value={lockedCode} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("codeLabel")}</span>
          <input
            key={`code:${fieldKey}`}
            className="input text-center text-2xl tracking-[0.3em] uppercase"
            name="code"
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={36}
            placeholder={t("codePlaceholder")}
            defaultValue={codeDefault}
            required
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("nameLabel")}</span>
        <input
          key={`name:${fieldKey}`}
          className="input"
          name="name"
          type="text"
          autoComplete="nickname"
          maxLength={GUEST_NAME_MAX}
          placeholder={t("namePlaceholder")}
          defaultValue={nameDefault}
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
