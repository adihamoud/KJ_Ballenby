"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatIsraeliMobile, normalizeIsraeliMobile } from "@/lib/phone";

type Step = { kind: "choose" } | { kind: "code"; phone: string };

export function LoginForm({
  locale,
  configured,
  next,
}: {
  locale: string;
  configured: boolean;
  /** Same-origin path to land on after sign-in (already validated by the page). */
  next: string;
}) {
  const t = useTranslations("login");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const callbackUrl = () =>
    `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`;

  const signInWithProvider = (provider: "google" | "azure") => {
    setError(null);
    startTransition(async () => {
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: callbackUrl(),
            ...(provider === "azure" ? { scopes: "email openid profile" } : {}),
          },
        });
        if (error) setError(t("errors.generic"));
      } catch {
        setError(t("errors.generic"));
      }
    });
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phone = normalizeIsraeliMobile(phoneInput);
    if (!phone) {
      setError(t("errors.invalidPhone"));
      return;
    }
    startTransition(async () => {
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) {
          setError(t("errors.generic"));
          return;
        }
        setStep({ kind: "code", phone });
      } catch {
        setError(t("errors.generic"));
      }
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    setError(null);
    startTransition(async () => {
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.verifyOtp({
          phone: step.phone,
          token: code.trim(),
          type: "sms",
        });
        if (error) {
          setError(t("errors.invalidCode"));
          return;
        }
        window.location.assign(next);
      } catch {
        setError(t("errors.generic"));
      }
    });
  };

  const disabled = pending || !configured;

  if (step.kind === "code") {
    return (
      <form onSubmit={verifyCode} className="card flex flex-col gap-4 p-5">
        <p className="text-muted text-sm">
          {t("codeSent", { phone: formatIsraeliMobile(step.phone) })}
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("codeLabel")}</span>
          <input
            className="input text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder={t("codePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {t("verify")}
        </button>
        <button
          type="button"
          className="text-muted text-sm underline"
          onClick={() => {
            setStep({ kind: "choose" });
            setCode("");
            setError(null);
          }}
        >
          {t("changePhone")}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!configured && (
        <p className="card text-accent p-4 text-sm">
          Supabase is not configured for this environment. See docs/SETUP_ACCOUNTS.md.
        </p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => signInWithProvider("google")}
        disabled={disabled}
      >
        <GoogleIcon />
        {t("google")}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => signInWithProvider("azure")}
        disabled={disabled}
      >
        <MicrosoftIcon />
        {t("microsoft")}
      </button>

      <div className="text-muted flex items-center gap-3 text-sm">
        <span className="bg-border h-px flex-1" />
        {t("or")}
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={sendCode} className="card flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("phoneLabel")}</span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder={t("phonePlaceholder")}
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {t("sendCode")}
        </button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.8c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.1-10.1 7.1-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.8 2.4-8.5 2.4-6.3 0-11.7-4-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 23 23">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
