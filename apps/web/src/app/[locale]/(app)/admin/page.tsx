import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function VenueAdmin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <section className="card p-5">
        <p className="text-muted">{t("comingSoon")}</p>
      </section>
    </main>
  );
}
