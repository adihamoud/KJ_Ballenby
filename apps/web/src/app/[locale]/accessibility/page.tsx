import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { AccessibilityIcon } from "@/components/icons";
import { STATEMENT_UPDATED, a11yContact } from "@/lib/a11y/contact";

export async function generateMetadata() {
  const t = await getTranslations("a11y.statement");
  return { title: t("title") };
}

const DONE = [
  "keyboard",
  "screenReaders",
  "structure",
  "contrast",
  "zoom",
  "menu",
  "motion",
  "drag",
  "checks",
] as const;
const LIMITS = ["youtube", "confirm", "venue"] as const;

/**
 * The accessibility statement (הצהרת נגישות) that Israeli regulation 35 requires: the standard we
 * meet, what was done, known limitations and whom to contact. Linked from every page's footer.
 */
export default async function AccessibilityStatementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("a11y.statement");
  const format = await getFormatter();
  const contact = a11yContact();
  const updated = format.dateTime(new Date(`${STATEMENT_UPDATED}T12:00:00Z`), {
    dateStyle: "long",
  });

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-5">
      <GuestHeader />

      <div className="flex flex-col gap-3 pt-2">
        <span className="bg-surface-3 text-brand-2 flex size-12 items-center justify-center rounded-2xl">
          <AccessibilityIcon size={26} />
        </span>
        <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
        <p className="text-muted leading-relaxed text-pretty">{t("intro")}</p>
      </div>

      <section aria-labelledby="standard" className="card flex flex-col gap-2 p-5">
        <h2 id="standard" className="text-xl font-bold">
          {t("standard.title")}
        </h2>
        <p className="leading-relaxed">{t("standard.body")}</p>
      </section>

      <section aria-labelledby="done" className="card flex flex-col gap-3 p-5">
        <h2 id="done" className="text-xl font-bold">
          {t("done.title")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
          {DONE.map((key) => (
            <li key={key}>{t(`done.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="settings" className="card flex flex-col gap-2 p-5">
        <h2 id="settings" className="text-xl font-bold">
          {t("settings.title")}
        </h2>
        <p className="leading-relaxed">{t("settings.body")}</p>
      </section>

      <section aria-labelledby="limits" className="card flex flex-col gap-3 p-5">
        <h2 id="limits" className="text-xl font-bold">
          {t("limits.title")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
          {LIMITS.map((key) => (
            <li key={key}>{t(`limits.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact" className="card flex flex-col gap-3 p-5">
        <h2 id="contact" className="text-xl font-bold">
          {t("contact.title")}
        </h2>
        <p className="leading-relaxed">{t("contact.body")}</p>
        {contact ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" data-testid="a11y-contact">
            {contact.name && (
              <>
                <dt className="text-muted">{t("contact.name")}</dt>
                <dd dir="auto">{contact.name}</dd>
              </>
            )}
            {contact.email && (
              <>
                <dt className="text-muted">{t("contact.email")}</dt>
                <dd>
                  <a href={`mailto:${contact.email}`} className="text-brand-2 underline" dir="ltr">
                    {contact.email}
                  </a>
                </dd>
              </>
            )}
            {contact.phone && (
              <>
                <dt className="text-muted">{t("contact.phone")}</dt>
                <dd>
                  <a href={`tel:${contact.phone}`} className="text-brand-2 underline" dir="ltr">
                    {contact.phone}
                  </a>
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p
            className="border-warning/40 bg-warning/10 rounded-xl border px-3 py-2.5"
            data-testid="a11y-contact-pending"
          >
            {t("contact.pending")}
          </p>
        )}
      </section>

      <p className="text-muted text-sm">{t("updated", { date: updated })}</p>
    </main>
  );
}
