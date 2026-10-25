import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogImport } from "@/components/admin/CatalogImport";
import { loadAdminVenue } from "@/lib/admin/venue";
import { loadCatalogOverview } from "@/lib/catalog/load";

export async function generateMetadata() {
  const t = await getTranslations("admin.catalog");
  return { title: t("metaTitle") };
}

const HISTORY_ERRORS = [
  "notAdmin",
  "unavailable",
  "busy",
  "invalid",
  "notFound",
  "nothingImported",
  "upload",
  "abandoned",
] as const;
type HistoryError = (typeof HISTORY_ERRORS)[number];

/** The stored `catalog_imports.error` as a message key; anything unexpected reads as unavailable. */
function historyError(value: string): HistoryError {
  return (HISTORY_ERRORS as readonly string[]).includes(value)
    ? (value as HistoryError)
    : "unavailable";
}

/** The venue's song catalog: counts, the import flow and the latest imports. */
export default async function AdminCatalog({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadAdminVenue();
  if (!loaded.ok) return null; // the layout renders the explanation
  const [t, format, catalog] = await Promise.all([
    getTranslations("admin"),
    getFormatter(),
    loadCatalogOverview(loaded.venue),
  ]);

  return (
    <main id="main" className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("catalog.title")}</h1>
      <p className="text-muted text-sm">{t("catalog.hint")}</p>
      {loaded.venue.mode === "demo" && (
        <p className="text-muted text-sm">{t("catalog.demoHint")}</p>
      )}

      {catalog.ok && (
        <p className="font-medium" data-testid="catalog-counts">
          {t("catalog.counts", {
            active: catalog.overview.active,
            inactive: catalog.overview.inactive,
          })}
        </p>
      )}

      <CatalogImport venueId={loaded.venue.id} mode={loaded.venue.mode} />

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("catalog.history.title")}</h2>
        {!catalog.ok ? (
          <p className="text-muted">{t("unavailable.body")}</p>
        ) : catalog.overview.imports.length === 0 ? (
          <p className="text-muted text-sm">{t("catalog.history.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="catalog-history">
            {catalog.overview.imports.map((item) => (
              <li
                key={item.id}
                className="border-border flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0"
                data-testid="catalog-history-row"
                data-status={item.status}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <bdi className="font-medium">
                    {item.stats.file || t("catalog.history.unnamed")}
                  </bdi>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      item.status === "done"
                        ? "bg-brand-2/20 text-text"
                        : item.status === "failed"
                          ? "bg-danger/20 text-text"
                          : "bg-surface-2 text-muted"
                    }`}
                  >
                    {t(`catalog.history.status.${item.status}`)}
                  </span>
                  <span className="text-muted text-sm">
                    {format.dateTime(new Date(item.createdAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="text-muted text-sm">
                  {t("catalog.history.summary", {
                    inserted: item.stats.inserted ?? 0,
                    updated: item.stats.updated ?? 0,
                    deactivated: item.stats.deactivated ?? 0,
                    skipped: item.stats.skipped ?? 0,
                  })}
                </p>
                {item.status === "failed" && item.error && (
                  <p className="text-danger text-sm">
                    {t(`catalog.errors.${historyError(item.error)}`)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
