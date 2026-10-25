"use client";

import { useState, useTransition } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatIsraeliMobile, normalizeIsraeliMobile } from "@/lib/phone";

export type AuthMode = "signin" | "signup";
type Method = "email" | "phone";
type Step =
  { kind: "choose" } | { kind: "code"; phone: string } | { kind: "checkInbox"; email: string };

const MIN_PASSWORD = 8;

/**
 * The four ways in: Google, Microsoft, email + password, and SMS code. `signin` only signs in
 * existing accounts (phone codes are not sent to unknown numbers, email needs the password);
 * `signup` asks for a name and creates the account. OAuth is the same call in both modes:
 * the provider's consent screen is the sign-up.
 */
export function AuthForm({
  mode,
  locale,
  configured,
  initialError,
}: {
  mode: AuthMode;
  locale: string;
  configured: boolean;
  initialError?: string;
}) {
  const t = useTranslations("auth");
  const [method, setMethod] = useState<Method>("email");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const callbackUrl = (next: string) =>
    `${window.location.origin}/${locale}/auth/callback?next=/${locale}${next}`;
  const goHome = () => window.location.assign(`/${locale}/app`);

  /** Run a Supabase call, mapping its error (or a throw) to a message on the form. */
  const run = (task: () => Promise<AuthError | string | null>) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const failure = await task();
        if (failure) setError(typeof failure === "string" ? failure : messageFor(failure));
      } catch {
        setError(t("errors.generic"));
      }
    });
  };

  const messageFor = (err: AuthError): string => {
    switch (err.code) {
      case "invalid_credentials":
        return t("errors.invalidCredentials");
      case "email_not_confirmed":
        return t("errors.emailNotConfirmed");
      case "weak_password":
        return t("errors.weakPassword");
      case "user_already_exists":
      case "email_exists":
        return t("errors.alreadyRegistered");
      case "otp_disabled":
        return t("errors.noAccount");
      case "otp_expired":
        return t("errors.invalidCode");
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
      case "over_sms_send_rate_limit":
        return t("errors.rateLimited");
      default:
        return t("errors.generic");
    }
  };

  const signInWithProvider = (provider: "google" | "azure") =>
    run(async () => {
      const { error } = await getBrowserSupabase().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl("/app"),
          ...(provider === "azure" ? { scopes: "email openid profile" } : {}),
        },
      });
      return error;
    });

  const trimmedName = name.trim();

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (mode === "signin") {
      run(async () => {
        const { error } = await getBrowserSupabase().auth.signInWithPassword({
          email: address,
          password,
        });
        if (!error) goHome();
        return error;
      });
      return;
    }
    if (!trimmedName) return setError(t("errors.nameRequired"));
    if (password.length < MIN_PASSWORD) return setError(t("errors.weakPassword"));
    run(async () => {
      const { data, error } = await getBrowserSupabase().auth.signUp({
        email: address,
        password,
        options: { data: { full_name: trimmedName }, emailRedirectTo: callbackUrl("/app") },
      });
      if (error) return error;
      if (data.session) {
        goHome();
        return null;
      }
      // With email confirmation on, Supabase answers a sign-up for a taken address with a
      // user that has no identities instead of an error (so addresses can't be enumerated).
      if (data.user?.identities?.length === 0) return t("errors.alreadyRegistered");
      setStep({ kind: "checkInbox", email: address });
      return null;
    });
  };

  const sendReset = () => {
    const address = email.trim();
    if (!address) return setError(t("errors.emailFirst"));
    run(async () => {
      const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(address, {
        redirectTo: callbackUrl("/login/reset"),
      });
      if (!error) setNotice(t("resetSent", { email: address }));
      return error;
    });
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !trimmedName) return setError(t("errors.nameRequired"));
    const phone = normalizeIsraeliMobile(phoneInput);
    if (!phone) return setError(t("errors.invalidPhone"));
    run(async () => {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({
        phone,
        options:
          mode === "signup"
            ? { shouldCreateUser: true, data: { full_name: trimmedName } }
            : { shouldCreateUser: false },
      });
      if (!error) setStep({ kind: "code", phone });
      return error;
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    run(async () => {
      const { error } = await getBrowserSupabase().auth.verifyOtp({
        phone: step.phone,
        token: code.trim(),
        type: "sms",
      });
      if (error) return t("errors.invalidCode");
      goHome();
      return null;
    });
  };

  const backToChoose = () => {
    setStep({ kind: "choose" });
    setCode("");
    setError(null);
    setNotice(null);
  };

  const disabled = pending || !configured;
  const errorLine = error && (
    <p role="alert" className="text-danger text-sm">
      {error}
    </p>
  );

  if (step.kind === "checkInbox") {
    return (
      <section className="card flex flex-col items-center gap-3 p-6 text-center">
        <span className="bg-surface-3 text-brand-2 flex size-12 items-center justify-center rounded-2xl">
          <MailIcon size={24} />
        </span>
        <h2 className="text-xl font-bold">{t("checkInbox.title")}</h2>
        <p className="text-muted">{t("checkInbox.body", { email: step.email })}</p>
        <button type="button" className="btn btn-secondary btn-sm mt-1" onClick={backToChoose}>
          {t("checkInbox.back")}
        </button>
      </section>
    );
  }

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
        {errorLine}
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {t("verify")}
        </button>
        <button type="button" className="text-muted text-sm underline" onClick={backToChoose}>
          {t("changePhone")}
        </button>
      </form>
    );
  }

  const nameField = mode === "signup" && (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("nameLabel")}</span>
      <input
        className="input"
        autoComplete="name"
        maxLength={40}
        placeholder={t("namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {!configured && <p className="card text-accent p-4 text-sm">{t("notConfigured")}</p>}

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

      <div className="card flex flex-col gap-4 p-5">
        <div
          role="group"
          aria-label={t("methods")}
          className="bg-surface-2 grid grid-cols-2 gap-1 rounded-full p-1"
        >
          {(["email", "phone"] as const).map((m) => {
            const Icon = m === "email" ? MailIcon : PhoneIcon;
            const active = method === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMethod(m);
                  setError(null);
                  setNotice(null);
                }}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-full text-sm font-bold transition ${
                  active ? "bg-surface-3 text-text shadow-sm" : "text-muted"
                }`}
              >
                <Icon size={16} />
                {t(m)}
              </button>
            );
          })}
        </div>

        {method === "email" ? (
          <form onSubmit={submitEmail} className="flex flex-col gap-4">
            {nameField}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("emailLabel")}</span>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("passwordLabel")}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  dir="ltr"
                  minLength={mode === "signup" ? MIN_PASSWORD : undefined}
                  aria-describedby={mode === "signup" ? "password-hint" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {mode === "signup" && (
                <span id="password-hint" className="text-faint text-xs">
                  {t("newPasswordHint")}
                </span>
              )}
            </div>
            {errorLine}
            {notice && (
              <p role="status" className="text-muted text-sm">
                {notice}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              {t(`${mode}.submit`)}
            </button>
            {mode === "signin" && (
              <button
                type="button"
                className="text-muted self-center text-sm underline underline-offset-4"
                onClick={sendReset}
                disabled={disabled}
              >
                {t("forgotPassword")}
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            {nameField}
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
            {errorLine}
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              {t("sendCode")}
            </button>
          </form>
        )}
      </div>
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
