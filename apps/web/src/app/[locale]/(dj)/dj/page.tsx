import { getTranslations, setRequestLocale } from "next-intl/server";
import { DjConsole } from "@/components/dj/DjConsole";
import { loadDjSnapshot } from "@/lib/dj/load";

export async function generateMetadata() {
  const t = await getTranslations("dj");
  return { title: t("metaTitle") };
}

/** DJ console: queue manager, player and mixer for the signed-in DJ's venue. */
export default async function DjConsolePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loaded = await loadDjSnapshot();

  if (!loaded.ok) {
    const t = await getTranslations("dj");
    const key = loaded.reason === "notStaff" ? "notStaff" : "unavailable";
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-6">
        <section className="card flex flex-col gap-2 p-6 text-center">
          <h1 className="text-xl font-bold">{t(`${key}.title`)}</h1>
          <p className="text-muted">{t(`${key}.body`)}</p>
          {loaded.reason === "unavailable" && (
            <a href="" className="btn btn-secondary mt-2">
              {t("unavailable.retry")}
            </a>
          )}
        </section>
      </main>
    );
  }

  return <DjConsole initial={loaded.snapshot} />;
}
