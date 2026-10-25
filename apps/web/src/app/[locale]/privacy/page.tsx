import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { Link } from "@/i18n/navigation";

// No cookies(), no dynamic export: prerendered for each locale from the layout's
// generateStaticParams, so the page needs no session and no client JavaScript of its own.

export async function generateMetadata() {
  const t = await getTranslations("privacy");
  return { title: t("metaTitle") };
}

type Section = {
  id: "who" | "collect" | "cookies" | "sharing" | "retention" | "rights" | "changes";
  /** Paragraphs before the list. */
  before: string[];
  /** List items, in message order. */
  items: string[];
  /** Paragraphs after the list. */
  after: string[];
  contact?: boolean;
};

const SECTIONS: Section[] = [
  { id: "who", before: ["body", "operator", "contact"], items: [], after: [], contact: true },
  {
    id: "collect",
    before: ["intro"],
    items: ["name", "guest", "account", "requests", "staff"],
    after: ["never"],
  },
  {
    id: "cookies",
    before: ["intro"],
    items: ["session", "table", "locale", "a11y"],
    after: ["firstParty"],
  },
  {
    id: "sharing",
    before: ["intro"],
    items: ["venue", "supabase", "vercel", "login", "twilio", "youtube"],
    after: ["abroad"],
  },
  {
    id: "retention",
    before: ["intro"],
    items: ["table", "guest", "requests", "account", "staff", "logs"],
    after: [],
  },
  { id: "rights", before: ["body", "leave", "complaint"], items: [], after: [] },
  { id: "changes", before: ["body"], items: [], after: [] },
];

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  // Keys are built from the static SECTIONS table above, so they always exist in both catalogs
  // (the i18n test keeps he and en identical); next-intl can't see that through the template.
  const rich = (key: string) =>
    t.rich(key as Parameters<typeof t.rich>[0], { b: (chunks) => <strong>{chunks}</strong> });

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5">
      <GuestHeader />

      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
        <p className="text-muted text-pretty">{t("intro")}</p>
        <p className="text-faint text-sm">{t("updated")}</p>
      </div>

      {SECTIONS.map((section) => {
        const headingId = `privacy-${section.id}-title`;
        return (
          <section
            key={section.id}
            aria-labelledby={headingId}
            data-testid={`privacy-${section.id}`}
            className="card flex flex-col gap-3 p-5"
          >
            <h2 id={headingId} className="text-xl font-black">
              {t(`${section.id}.title`)}
            </h2>
            {section.before.map((key) => (
              <p key={key} className="text-muted text-pretty">
                {rich(`${section.id}.${key}`)}
              </p>
            ))}
            {section.contact && (
              <a
                href={`mailto:${t("who.contactEmail")}`}
                dir="ltr"
                className="text-text self-start font-bold underline underline-offset-4"
                data-testid="privacy-contact"
              >
                {t("who.contactEmail")}
              </a>
            )}
            {section.items.length > 0 && (
              <ul className="text-muted ms-5 flex list-disc flex-col gap-2.5 text-pretty">
                {section.items.map((key) => (
                  <li key={key}>{rich(`${section.id}.${key}`)}</li>
                ))}
              </ul>
            )}
            {section.after.map((key) => (
              <p key={key} className="text-muted text-pretty">
                {rich(`${section.id}.${key}`)}
              </p>
            ))}
          </section>
        );
      })}

      <Link href="/" className="btn btn-secondary mb-2">
        {t("links.backHome")}
      </Link>
    </main>
  );
}
