import { readSupabaseEnv } from "@kj/db";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminNav } from "@/components/admin/AdminNav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Link, redirect } from "@/i18n/navigation";
import { loadAdminVenue } from "@/lib/admin/venue";
import { getCurrentUser } from "@/lib/supabase/server";

// Session and venue data depend on cookies; never prerender.
export const dynamic = "force-dynamic";

/**
 * Venue admin: owner/admin staff only. Signed-in users without an owner/admin membership
 * see an explanation instead of the pages. Without Supabase configured there is no way to
 * sign in, so the in-memory demo venue is served (same fallback as the DJ console).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (readSupabaseEnv()) {
    const user = await getCurrentUser();
    if (!user) redirect({ href: "/login", locale });
  }

  const t = await getTranslations("admin");
  const loaded = await loadAdminVenue();

  if (!loaded.ok) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-6">
        <section className="card flex flex-col gap-3 p-6 text-center">
          <h1 className="text-xl font-bold">{t(`${loaded.reason}.title`)}</h1>
          <p className="text-muted">{t(`${loaded.reason}.body`)}</p>
          {loaded.reason === "notAdmin" && (
            <Link href="/dj" className="btn btn-secondary mt-2">
              {t("notAdmin.dj")}
            </Link>
          )}
          {loaded.reason === "unavailable" && (
            <a href="" className="btn btn-secondary mt-2">
              {t("unavailable.retry")}
            </a>
          )}
          {loaded.reason !== "unavailable" && (
            <form action={`/${locale}/auth/signout`} method="post">
              <button type="submit" className="btn btn-secondary w-full">
                {t("nav.signOut")}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  const { venue } = loaded;
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6 print:max-w-none print:gap-0 print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col">
          <span className="text-muted text-xs font-semibold tracking-wide uppercase">
            {t("title")}
          </span>
          <span className="text-lg font-bold" data-testid="admin-venue-name">
            {venue.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {venue.mode === "demo" && (
            <span
              className="bg-accent/20 text-accent rounded-full px-2.5 py-1 text-xs font-semibold"
              title={t("demoHint")}
            >
              {t("demoBadge")}
            </span>
          )}
          <LocaleSwitcher />
        </div>
      </header>

      <AdminNav mode={venue.mode} locale={locale} />

      {children}
    </div>
  );
}
