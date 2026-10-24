import { getTranslations, setRequestLocale } from "next-intl/server";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { rulesToFormValues } from "@/lib/admin/rules-form";
import { loadAdminRules, loadAdminVenue } from "@/lib/admin/venue";

export async function generateMetadata() {
  const t = await getTranslations("admin.settings");
  return { title: t("metaTitle") };
}

/** Venue name and queue rules. */
export default async function AdminSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadAdminVenue();
  if (!loaded.ok) return null; // the layout renders the explanation
  const t = await getTranslations("admin");
  const rules = await loadAdminRules(loaded.venue);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      {rules.ok ? (
        <SettingsForm
          initial={{ name: loaded.venue.name, ...rulesToFormValues(rules.rules) }}
          mode={loaded.venue.mode}
        />
      ) : (
        <section className="card p-5">
          <p className="text-muted">{t("unavailable.body")}</p>
        </section>
      )}
    </main>
  );
}
