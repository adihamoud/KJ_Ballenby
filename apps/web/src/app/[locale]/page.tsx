import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">{t("common.appName")}</span>
        <LocaleSwitcher />
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6 py-12">
        <p className="text-brand text-sm font-semibold tracking-wide uppercase">
          {t("common.tagline")}
        </p>
        <h1 className="text-4xl leading-tight font-extrabold">{t("landing.title")}</h1>
        <p className="text-muted text-lg">{t("landing.subtitle")}</p>
        <div className="mt-4 flex flex-col gap-3">
          <Link href="/join" className="btn btn-primary text-lg">
            {t("landing.guestCta")}
          </Link>
          <Link href="/login" className="btn btn-secondary">
            {t("landing.cta")}
          </Link>
        </div>
      </section>

      <footer className="text-muted pb-4 text-center text-sm">
        {t("landing.forVenues")}
        <Link href="/admin" className="text-text underline">
          {t("landing.forVenuesLink")}
        </Link>
      </footer>
    </main>
  );
}
