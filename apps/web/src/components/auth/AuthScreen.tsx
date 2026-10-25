import { readSupabaseEnv } from "@kj/db";
import { getTranslations } from "next-intl/server";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { AuthForm, type AuthMode } from "./AuthForm";

/**
 * Shared page body of /login and /signup. Signed-in users go straight home; an anonymous
 * guest session (from joining a table) does not count, so a guest can still sign in or sign up.
 */
export async function AuthScreen({
  mode,
  locale,
  error,
}: {
  mode: AuthMode;
  locale: string;
  error?: string;
}) {
  const user = await getCurrentUser();
  if (user && !user.is_anonymous) redirect({ href: "/app", locale });
  // Signing up from a guest session would create a second user and strand the guest's requests
  // under the anonymous one. Until sign-up upgrades the anonymous user instead (updateUser /
  // linkIdentity, docs/ARCHITECTURE.md section 5), guests go back to their table.
  if (user?.is_anonymous && mode === "signup") redirect({ href: "/guest", locale });

  const [t, tPrivacy] = await Promise.all([getTranslations("auth"), getTranslations("privacy")]);
  const other = mode === "signin" ? "/signup" : "/login";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5">
      <GuestHeader />

      <div className="pt-2">
        <h1 className="text-3xl font-black tracking-tight">{t(`${mode}.title`)}</h1>
        <p className="text-muted mt-1">{t(`${mode}.subtitle`)}</p>
      </div>

      <AuthForm
        mode={mode}
        locale={locale}
        configured={Boolean(readSupabaseEnv())}
        initialError={error === "auth" ? t("errors.auth") : undefined}
      />

      <p className="text-faint text-center text-xs" data-testid="auth-privacy">
        {tPrivacy.rich("links.auth", {
          link: (chunks) => (
            <Link href="/privacy" className="text-muted underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <p className="text-muted text-center text-sm">
        {t(`${mode}.switchPrompt`)}
        <Link
          href={other}
          className="text-text font-bold underline underline-offset-4"
          data-testid="auth-switch"
        >
          {t(`${mode}.switchLink`)}
        </Link>
      </p>

      <section className="card mt-auto flex flex-col gap-3 p-5 text-center">
        <p className="text-muted text-sm">{t("guestHint")}</p>
        <Link href="/join" className="btn btn-secondary" data-testid="guest-cta">
          {t("guestCta")}
        </Link>
      </section>
    </main>
  );
}
