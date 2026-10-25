import { getTranslations, setRequestLocale } from "next-intl/server";
import { TablesBoard } from "@/components/admin/TablesBoard";
import { loadAdminVenue } from "@/lib/admin/venue";
import { loadTonightBoard } from "@/lib/admin/tonight-load";

export async function generateMetadata() {
  const t = await getTranslations("admin.tonight");
  return { title: t("metaTitle") };
}

/** Tables tonight: who sits at each table, since when, and what they sang or are waiting for. */
export default async function AdminTonightPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const venue = await loadAdminVenue();
  if (!venue.ok) return null; // the layout renders the explanation
  const loaded = await loadTonightBoard();
  if (!loaded.ok) {
    const t = await getTranslations("admin");
    return (
      <main id="main" className="card flex flex-col gap-2 p-5">
        <p className="text-muted">{t("unavailable.body")}</p>
        <a href="?" className="btn btn-secondary self-start">
          {t("unavailable.retry")}
        </a>
      </main>
    );
  }
  return <TablesBoard initial={loaded.board} />;
}
