import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintButton } from "@/components/admin/PrintButton";
import { Link } from "@/i18n/navigation";
import { getAppOrigin } from "@/lib/admin/app-url";
import { qrSymbol } from "@/lib/admin/qr";
import { loadAdminTables, loadAdminVenue } from "@/lib/admin/venue";

export async function generateMetadata() {
  const t = await getTranslations("admin.qr");
  return { title: t("metaTitle") };
}

/**
 * Printable QR sheet: one card per active table with the QR of the table's join link and the
 * typed code as a fallback. Cards are white with black ink whatever the screen theme, so what
 * is on screen is what prints; A4 layout lives in `globals.css` under `@media print`.
 */
export default async function AdminQrSheet({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadAdminVenue();
  if (!loaded.ok) return null; // the layout renders the explanation
  const t = await getTranslations("admin.qr");
  const [tables, origin] = await Promise.all([loadAdminTables(loaded.venue), getAppOrigin()]);
  const active = tables.ok ? tables.tables.filter((x) => x.is_active) : [];
  const joinUrl = `${origin}/${locale}/join`;

  return (
    <main id="main" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <PrintButton label={t("print")} />
      </div>
      <p className="text-muted text-sm print:hidden">{t("hint", { count: active.length })}</p>

      {!tables.ok ? (
        <section className="card p-5 print:hidden">
          <p className="text-muted">{t("unavailable")}</p>
        </section>
      ) : active.length === 0 ? (
        <section className="card p-5 print:hidden">
          <p className="text-muted">{t("noTables")}</p>
          <Link href="/admin/tables" className="btn btn-secondary mt-3">
            {t("addTables")}
          </Link>
        </section>
      ) : (
        <section className="qr-sheet grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={t("title")}>
          {active.map((table) => {
            const url = `${origin}/${locale}/j/${table.qr_token}`;
            const symbol = qrSymbol(url);
            return (
              <article
                key={table.id}
                className="qr-card flex flex-col items-center gap-2 rounded-2xl border-2 border-black bg-white p-5 text-center text-black"
                data-testid="qr-card"
              >
                <p className="text-sm font-semibold tracking-wide uppercase">{loaded.venue.name}</p>
                <h2 className="text-4xl font-extrabold">{table.label}</h2>
                <a
                  href={url}
                  className="block w-44 max-w-full"
                  aria-label={t("scan", { table: table.label })}
                >
                  <svg
                    viewBox={`0 0 ${symbol.size} ${symbol.size}`}
                    shapeRendering="crispEdges"
                    role="img"
                    aria-hidden="true"
                    className="h-auto w-full"
                  >
                    <rect width={symbol.size} height={symbol.size} fill="#fff" />
                    <path d={symbol.path} fill="#000" />
                  </svg>
                </a>
                <p className="text-base font-semibold">{t("scan", { table: table.label })}</p>
                <p className="text-sm">{t("orType")}</p>
                <p
                  dir="ltr"
                  className="rounded-lg border border-black px-4 py-1 font-mono text-3xl font-bold tracking-[0.3em]"
                  data-testid="qr-code-text"
                >
                  {table.join_code}
                </p>
                <p dir="ltr" className="text-xs break-all">
                  {joinUrl}
                </p>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
