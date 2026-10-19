import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { QrCode } from "@/components/QrCode";
import { getAppOrigin } from "@/lib/origin";
import {
  ADMIN_ROLES,
  getStaffVenues,
  getVenueTables,
  pickStaffVenue,
} from "@/lib/supabase/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildJoinUrl } from "@/lib/urls";
import { PrintButton } from "./PrintButton";

export async function generateMetadata() {
  const t = await getTranslations("admin.print");
  return { title: t("title") };
}

/** One card per active table, laid out for A4/Letter printing (light background). */
export default async function PrintTablesPage({
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
  const tables = (
    supabase && current ? await getVenueTables(supabase, current.venue.id) : []
  ).filter((table) => table.is_active);
  const origin = await getAppOrigin();
  const manualUrl = `${origin}/${locale}/join`;

  return (
    <main className="print-sheet mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={{
            pathname: "/admin/tables",
            query: current ? { venue: current.venue.id } : undefined,
          }}
          className="text-muted text-sm underline"
        >
          {t("print.back")}
        </Link>
        <PrintButton label={t("print.print")} />
      </header>

      <h1 className="text-2xl font-bold">
        {t("print.title")}
        {current && <span className="ms-2 font-normal">· {current.venue.name}</span>}
      </h1>

      {!current ? (
        <p>{t("notStaff")}</p>
      ) : tables.length === 0 ? (
        <p>{t("tables.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {tables.map((table) => (
            <li
              key={table.id}
              className="print-card flex flex-col items-center gap-2 rounded-2xl border p-4 text-center"
            >
              <p className="text-sm font-medium">{current.venue.name}</p>
              <p className="text-3xl font-extrabold">{table.label}</p>
              <QrCode
                value={buildJoinUrl(origin, locale, table.qr_token)}
                size={200}
                label={t("tables.qrAlt", { label: table.label })}
              />
              <p className="text-sm">{t("print.scan")}</p>
              <p className="text-sm">
                {t("print.orCode")}{" "}
                <code dir="ltr" className="font-mono text-xl font-bold tracking-widest">
                  {table.join_code}
                </code>
              </p>
              <p dir="ltr" className="text-xs">
                {manualUrl}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
