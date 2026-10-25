import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { MicIcon, MusicIcon, QrIcon } from "@/components/icons";

const STEPS = [
  { key: "scan", Icon: QrIcon },
  { key: "pick", Icon: MusicIcon },
  { key: "sing", Icon: MicIcon },
] as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 py-5">
      <GuestHeader />

      <section className="flex flex-col gap-5 pt-6">
        <p className="text-brand flex items-center gap-2 text-sm font-bold">
          <MicIcon size={16} strokeWidth={2.4} />
          {t("common.tagline")}
        </p>
        <h1 className="text-4xl leading-[1.12] font-black tracking-tight text-balance">
          {t("landing.title")}
        </h1>
        <p className="text-muted text-lg leading-relaxed text-pretty">{t("landing.subtitle")}</p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <Link href="/join" className="btn btn-primary w-full text-lg">
            {t("landing.guestCta")}
          </Link>
          <p className="text-faint text-sm">{t("landing.noAccount")}</p>
        </div>
      </section>

      <ol className="flex flex-col gap-3">
        {STEPS.map(({ key, Icon }, index) => (
          <li key={key} className="card flex items-center gap-4 p-4">
            <span className="bg-surface-3 text-brand-2 relative flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <Icon size={22} />
              <span className="bg-brand absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[0.7rem] font-black text-white tabular-nums">
                {index + 1}
              </span>
            </span>
            <div className="min-w-0">
              <p className="font-bold">{t(`landing.steps.${key}.title`)}</p>
              <p className="text-muted text-sm leading-snug">{t(`landing.steps.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-auto flex flex-col items-center gap-3 pt-4 pb-2">
        <Link href="/login" className="btn btn-ghost btn-sm">
          {t("landing.cta")}
        </Link>
        <p className="text-faint text-sm">
          {t("landing.forVenues")}
          <Link href="/admin" className="text-muted underline underline-offset-4">
            {t("landing.forVenuesLink")}
          </Link>
        </p>
      </footer>
    </main>
  );
}
