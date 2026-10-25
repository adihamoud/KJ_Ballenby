import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { LogInIcon, MicIcon, MusicIcon, QrIcon, UserPlusIcon } from "@/components/icons";

const STEPS = [
  { key: "scan", Icon: QrIcon },
  { key: "pick", Icon: MusicIcon },
  { key: "sing", Icon: MicIcon },
] as const;

// The three ways in: create an account, sign in to one, or skip accounts and join a table.
const ENTRIES = [
  { key: "newUser", href: "/signup", Icon: UserPlusIcon, flip: false },
  { key: "existingUser", href: "/login", Icon: LogInIcon, flip: true },
  { key: "guest", href: "/join", Icon: QrIcon, flip: false },
] as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 py-5">
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
      </section>

      <section aria-labelledby="entry-heading" className="flex flex-col gap-3">
        <h2 id="entry-heading" className="eyebrow">
          {t("landing.choose")}
        </h2>
        {ENTRIES.map(({ key, href, Icon, flip }) => (
          <Link
            key={key}
            href={href}
            data-testid={`entry-${key}`}
            className={`flex items-center gap-4 rounded-[var(--radius-xl)] p-4 transition active:scale-[0.98] ${
              key === "guest"
                ? "bg-brand-fill text-white shadow-[var(--shadow-glow)]"
                : "card-raised"
            }`}
          >
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
                key === "guest" ? "bg-white/20" : "bg-surface-3 text-brand-2"
              }`}
            >
              <Icon size={22} className={flip ? "rtl:-scale-x-100" : undefined} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-lg font-bold">{t(`landing.entries.${key}.title`)}</span>
              <span
                className={`text-sm leading-snug ${key === "guest" ? "text-white" : "text-muted"}`}
              >
                {t(`landing.entries.${key}.body`)}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <ol className="flex flex-col gap-3">
        {STEPS.map(({ key, Icon }, index) => (
          <li key={key} className="card flex items-center gap-4 p-4">
            <span className="bg-surface-3 text-brand-2 relative flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <Icon size={22} />
              <span className="bg-brand-fill absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[0.7rem] font-black text-white tabular-nums">
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

      <footer className="mt-auto flex justify-center pt-4 pb-2">
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
