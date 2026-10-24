import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminQueue } from "@/components/admin/AdminQueue";
import { loadAdminVenue } from "@/lib/admin/venue";
import { loadDjSnapshot } from "@/lib/dj/load";

export async function generateMetadata() {
  const t = await getTranslations("admin.queue");
  return { title: t("metaTitle") };
}

/**
 * Tonight's queue for owners and admins: reorder, pin, prioritise, approve and skip from the
 * admin area. Reads the same snapshot as the DJ console; writes go through the same host
 * actions under the user's own session (RLS: venue staff).
 */
export default async function AdminQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const venue = await loadAdminVenue();
  if (!venue.ok) return null; // the layout renders the explanation
  const loaded = await loadDjSnapshot();
  if (!loaded.ok) {
    const t = await getTranslations("admin");
    return (
      <main className="card flex flex-col gap-2 p-5">
        <p className="text-muted">{t("unavailable.body")}</p>
        <a href="" className="btn btn-secondary self-start">
          {t("unavailable.retry")}
        </a>
      </main>
    );
  }
  return <AdminQueue initial={loaded.snapshot} />;
}
