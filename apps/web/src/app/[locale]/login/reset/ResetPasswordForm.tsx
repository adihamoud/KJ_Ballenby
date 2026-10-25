"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t("errors.weakPassword"));
    setError(null);
    startTransition(async () => {
      try {
        const { error } = await getBrowserSupabase().auth.updateUser({ password });
        if (error) {
          setError(error.code === "weak_password" ? t("errors.weakPassword") : t("errors.generic"));
          return;
        }
        window.location.assign(`/${locale}/app`);
      } catch {
        setError(t("errors.generic"));
      }
    });
  };

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("passwordLabel")}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            minLength={MIN_PASSWORD}
            aria-describedby="password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <span id="password-hint" className="text-faint text-xs">
          {t("newPasswordHint")}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t("reset.submit")}
      </button>
    </form>
  );
}
