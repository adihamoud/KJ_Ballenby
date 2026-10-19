import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { VenueSwitcher } from "@/components/VenueSwitcher";
import { ADMIN_ROLES, getStaffVenues, pickStaffVenue } from "@/lib/supabase/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function VenueAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ venue?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { venue: venueParam } = await searchParams;
  const t = await getTranslations("admin");

  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const venues = (supabase && user ? await getStaffVenues(supabase, user.id) : []).filter((v) =>
    ADMIN_ROLES.includes(v.role),
  );
  const current = pickStaffVenue(venues, venueParam);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <VenueSwitcher venues={venues} currentId={current?.venue.id} pathname="/admin" />
      </header>

      {!current ? (
        <section className="card p-5">
          <p className="text-muted">{t("notStaff")}</p>
        </section>
      ) : (
        <>
          <p className="text-muted text-sm">
            {t("venue")}: <span className="text-text font-medium">{current.venue.name}</span>
          </p>
          <nav className="grid gap-3 sm:grid-cols-2">
            <Link
              href={{ pathname: "/admin/tables", query: { venue: current.venue.id } }}
              className="card hover:border-brand-2 flex flex-col gap-1 p-5 transition"
            >
              <span className="font-semibold">{t("nav.tables")}</span>
              <span className="text-muted text-sm">{t("nav.tablesHint")}</span>
            </Link>
          </nav>
        </>
      )}
    </main>
  );
}
