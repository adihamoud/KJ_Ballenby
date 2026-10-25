"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  const tPrivacy = useTranslations("privacy");
  const [state, formAction, pending] = useActionState(joinTableAction, initialJoinState);
  const codeDefault = state.code ?? code;
  const nameDefault = state.name ?? name;
  const fieldKey = `${codeDefault}\u0000${nameDefault}`;
  const codeInvalid = state.error === "invalidCode" || state.error === "notFound";
  const nameInvalid = state.error === "nameRequired";

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5">
      <input type="hidden" name="locale" value={locale} />

      {lockedCode ? (
        <input type="hidden" name="code" value={lockedCode} />
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t("codeLabel")}</span>
          <input
            key={`code:${fieldKey}`}
            className="input h-16 text-center font-mono text-3xl font-bold tracking-[0.3em] uppercase"
            name="code"
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={36}
            placeholder={t("codePlaceholder")}
            defaultValue={codeDefault}
            aria-invalid={codeInvalid || undefined}
            required
          />
          <span className="text-faint text-xs">{t("codeHint")}</span>
        </label>
      )}

      {/* The privacy notice sits outside the label: a link inside a label would join the
          input's accessible name and steal taps meant for the field. */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t("nameLabel")}</span>
          <input
            key={`name:${fieldKey}`}
            className="input"
            name="name"
            type="text"
            autoComplete="nickname"
            maxLength={GUEST_NAME_MAX}
            placeholder={t("namePlaceholder")}
            defaultValue={nameDefault}
            aria-invalid={nameInvalid || undefined}
            aria-describedby="join-name-privacy"
            required
          />
        </label>
        <span id="join-name-privacy" className="text-faint text-xs">
          {tPrivacy.rich("links.join", {
            link: (chunks) => (
              <Link
                href="/privacy"
                className="text-muted underline underline-offset-4"
                data-testid="join-privacy"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </div>

      {state.error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger border-danger/30 rounded-xl border px-3 py-2.5 text-sm font-medium"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}

      <button type="submit" className="btn btn-primary text-base" disabled={pending}>
        {pending ? t("submitting") : lockedCode ? t("confirmSubmit") : t("submit")}
      </button>
    </form>
  );
}
