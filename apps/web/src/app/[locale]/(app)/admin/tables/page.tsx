import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { VenueSwitcher } from "@/components/VenueSwitcher";
import { getAppOrigin } from "@/lib/origin";
import {
  ADMIN_ROLES,
  getStaffVenues,
  getVenueTables,
  pickStaffVenue,
} from "@/lib/supabase/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildJoinUrl } from "@/lib/urls";
import { NewTableForm } from "./NewTableForm";
import { TableCard } from "./TableCard";

export async function generateMetadata() {
  const t = await getTranslations("admin.tables");
  return { title: t("title") };
}

export default async function AdminTablesPage({
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
  const tables = supabase && current ? await getVenueTables(supabase, current.venue.id) : [];
  const origin = await getAppOrigin();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="text-muted text-sm underline">
          {t("title")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {t("tables.title")}
            {current && (
              <span className="text-muted ms-2 text-base font-normal">{current.venue.name}</span>
            )}
          </h1>
          <VenueSwitcher venues={venues} currentId={current?.venue.id} pathname="/admin/tables" />
        </div>
      </header>

      {!current ? (
        <section className="card p-5">
          <p className="text-muted">{t("notStaff")}</p>
        </section>
      ) : (
        <>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-semibold">{t("tables.add")}</h2>
            <NewTableForm venueId={current.venue.id} />
          </section>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {t("tables.title")} ({tables.length})
            </h2>
            <Link
              href={{ pathname: "/admin/tables/print", query: { venue: current.venue.id } }}
              className="btn btn-secondary"
            >
              {t("tables.print")}
            </Link>
          </div>

          {tables.length === 0 ? (
            <p className="text-muted">{t("tables.empty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" data-testid="table-list">
              {tables.map((table) => (
                <li key={table.id}>
                  <TableCard table={table} joinUrl={buildJoinUrl(origin, locale, table.qr_token)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
