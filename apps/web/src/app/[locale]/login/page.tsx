import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

// Redirects signed-in users, so it must read cookies at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (user) redirect({ href: "/app", locale });

  const t = await getTranslations("login");
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-1">{t("subtitle")}</p>
      </div>
      <LoginForm locale={locale} configured={supabaseConfigured} />

      <section className="card flex flex-col gap-3 p-5 text-center">
        <p className="text-muted text-sm">{t("guestHint")}</p>
        <Link href="/join" className="btn btn-secondary" data-testid="guest-cta">
          {t("guestCta")}
        </Link>
      </section>
    </main>
  );
}
