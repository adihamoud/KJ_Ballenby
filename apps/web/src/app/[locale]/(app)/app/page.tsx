import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Link } from "@/i18n/navigation";
import { loadStaffMembership } from "@/lib/admin/membership";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Signed-in home. Venue staff get their venue, role and shortcuts to the DJ console and (for
 * owners and admins) the venue admin; everyone else gets the guest hint.
 */
export default async function GuestHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const [user, staff] = await Promise.all([getCurrentUser(), loadStaffMembership()]);

  const name =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email ??
    user?.phone ??
    "";
  const canAdmin = staff?.role === "owner" || staff?.role === "admin";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">{t("common.appName")}</span>
        <LocaleSwitcher />
      </header>

      <h1 className="text-2xl font-bold">{t("app.welcome", { name })}</h1>

      {staff ? (
        <section className="card flex flex-col gap-4 p-5" data-testid="staff-card">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{staff.venueName || t("app.staff.venue")}</h2>
            <p className="text-muted">
              {t("app.staff.role", { role: t(`app.staff.roles.${staff.role}`) })}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/dj" className="btn btn-primary">
              {t("admin.nav.dj")}
            </Link>
            {canAdmin && (
              <Link href="/admin" className="btn btn-secondary">
                {t("admin.title")}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="card p-5">
          <p className="text-muted">{t("app.noNight")}</p>
        </section>
      )}

      <form action={`/${locale}/auth/signout`} method="post" className="mt-auto">
        <button type="submit" className="btn btn-secondary w-full">
          {t("app.signOut")}
        </button>
      </form>
    </main>
  );
}
