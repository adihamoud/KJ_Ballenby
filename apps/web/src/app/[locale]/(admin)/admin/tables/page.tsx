import { getTranslations, setRequestLocale } from "next-intl/server";
import { AddTableForm } from "@/components/admin/AddTableForm";
import { TableRowActions } from "@/components/admin/TableRowActions";
import { Link } from "@/i18n/navigation";
import { loadAdminTables, loadAdminVenue } from "@/lib/admin/venue";

export async function generateMetadata() {
  const t = await getTranslations("admin.tables");
  return { title: t("metaTitle") };
}

/** Tables of the venue: label, typed join code and whether guests can still join. */
export default async function AdminTables({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadAdminVenue();
  if (!loaded.ok) return null; // the layout renders the explanation
  const t = await getTranslations("admin");
  const tables = await loadAdminTables(loaded.venue);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("tables.title")}</h1>
        <Link href="/admin/qr" className="text-muted text-sm underline">
          {t("overview.printQr")}
        </Link>
      </div>
      <p className="text-muted text-sm">{t("tables.hint")}</p>

      <AddTableForm />

      {!tables.ok ? (
        <section className="card p-5">
          <p className="text-muted">{t("unavailable.body")}</p>
        </section>
      ) : tables.tables.length === 0 ? (
        <section className="card p-5">
          <p className="text-muted">{t("tables.empty")}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("tables.title")}>
          {tables.tables.map((table) => (
            <li
              key={table.id}
              className={`card flex flex-col gap-3 p-4 ${table.is_active ? "" : "opacity-70"}`}
              data-testid="table-row"
              data-table-label={table.label}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold" data-testid="table-label">
                    {table.label}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      table.is_active ? "bg-brand-2/20 text-text" : "bg-surface-2 text-muted"
                    }`}
                    data-testid="table-status"
                  >
                    {table.is_active ? t("tables.active") : t("tables.inactive")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">{t("tables.code")}</span>
                  <code
                    dir="ltr"
                    className="bg-surface-2 rounded-md px-2 py-1 font-mono text-base tracking-[0.2em]"
                    data-testid="table-code"
                  >
                    {table.join_code}
                  </code>
                </div>
              </div>
              <TableRowActions
                table={{ id: table.id, label: table.label, isActive: table.is_active }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
