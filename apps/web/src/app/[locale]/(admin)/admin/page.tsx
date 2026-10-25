import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { loadAdminRules, loadAdminTables, loadAdminVenue } from "@/lib/admin/venue";
import { loadCatalogOverview } from "@/lib/catalog/load";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("metaTitle") };
}

/** Overview: where the venue stands, with a shortcut into each section. */
export default async function AdminOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadAdminVenue();
  if (!loaded.ok) return null; // the layout renders the explanation
  const t = await getTranslations("admin");
  const [tables, rules, catalog] = await Promise.all([
    loadAdminTables(loaded.venue),
    loadAdminRules(loaded.venue),
    loadCatalogOverview(loaded.venue),
  ]);
  const active = tables.ok ? tables.tables.filter((x) => x.is_active).length : 0;
  const total = tables.ok ? tables.tables.length : 0;

  return (
    <main id="main" className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("overview.title")}</h1>
      {loaded.venue.mode === "demo" && <p className="text-muted text-sm">{t("demoHint")}</p>}

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("nav.dj")}</h2>
        <p className="text-muted">{t("overview.djHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dj" className="btn btn-primary">
            {t("overview.openDj")}
          </Link>
          <Link href="/admin/tonight" className="btn btn-secondary">
            {t("nav.tonight")}
          </Link>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("nav.tables")}</h2>
        <p className="text-muted">
          {tables.ok ? t("overview.tables", { total, active }) : t("unavailable.body")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/tables" className="btn btn-primary">
            {t("overview.manageTables")}
          </Link>
          <Link href="/admin/qr" className="btn btn-secondary">
            {t("overview.printQr")}
          </Link>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("nav.catalog")}</h2>
        <p className="text-muted">
          {catalog.ok
            ? t("overview.catalog", { count: catalog.overview.active })
            : t("unavailable.body")}
        </p>
        <Link href="/admin/catalog" className="btn btn-primary self-start">
          {t("overview.manageCatalog")}
        </Link>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("settings.rules.title")}</h2>
        {rules.ok ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t("settings.rules.fairness")}</dt>
            <dd>{t(`settings.rules.fairnessOptions.${rules.rules.fairness}`)}</dd>
            <dt className="text-muted">{t("settings.rules.maxPendingPerUser")}</dt>
            <dd>{rules.rules.maxPendingPerUser}</dd>
            <dt className="text-muted">{t("settings.rules.requireHostApproval")}</dt>
            <dd>{rules.rules.requireHostApproval ? t("overview.on") : t("overview.off")}</dd>
          </dl>
        ) : (
          <p className="text-muted">{t("unavailable.body")}</p>
        )}
        <Link href="/admin/settings" className="btn btn-secondary self-start">
          {t("overview.editSettings")}
        </Link>
      </section>
    </main>
  );
}
