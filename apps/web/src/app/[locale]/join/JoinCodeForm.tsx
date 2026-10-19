"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isValidJoinCode, JOIN_CODE_MAX_LENGTH, normalizeJoinCode } from "@/lib/join-code";
import { joinPath } from "@/lib/urls";

/**
 * Manual fallback for guests whose camera does not read the QR: type the code from the
 * table card. Validation is local; resolving happens on /join/[code].
 */
export function JoinCodeForm({ locale }: { locale: string }) {
  const t = useTranslations("join");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeJoinCode(value);
    if (!isValidJoinCode(code)) {
      setError(t("errors.invalidCode"));
      return;
    }
    setError(null);
    router.push(joinPath(locale, code));
  };

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("codeLabel")}</span>
        <input
          className="input text-center font-mono text-2xl tracking-[0.3em] uppercase"
          name="code"
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={JOIN_CODE_MAX_LENGTH + 2}
          placeholder={t("codePlaceholder")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-code-error" : undefined}
        />
      </label>
      {error && (
        <p id="join-code-error" role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary">
        {t("submit")}
      </button>
    </form>
  );
}
