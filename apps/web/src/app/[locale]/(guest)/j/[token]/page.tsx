import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { normalizeJoinCode } from "@/lib/guest/join-code";
import { resolveTable } from "@/lib/guest/resolve";
import { getGuestSession } from "@/lib/guest/session";
import { JoinForm } from "../../join/JoinForm";

// Resolves the token against the database on every hit; never prerender.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("join");
  return { title: t("title") };
}

/** Landing page for a printed QR: `https://<app>/<locale>/j/<qr_token>`. */
export default async function QrJoinPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const code = normalizeJoinCode(token);
  const result = code ? await resolveTable(code) : null;

  if (result?.ok) {
    const session = await getGuestSession();
    if (session?.tableId === result.table.table_id) redirect({ href: "/guest", locale });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          {t("common.appName")}
        </Link>
        <LocaleSwitcher />
      </header>

      {result?.ok ? (
        <>
          <div>
            <p className="text-brand text-sm font-semibold tracking-wide uppercase">
              {result.table.venue_name}
            </p>
            <h1 className="text-3xl font-bold">
              {t("join.joining", { table: result.table.table_label })}
            </h1>
            <p className="text-muted mt-1">{t("join.nameHint")}</p>
          </div>
          <JoinForm
            locale={locale}
            lockedCode={code ?? undefined}
            name={(await getGuestSession())?.name ?? ""}
          />
        </>
      ) : (
        <section className="card flex flex-col gap-4 p-5">
          <h1 className="text-2xl font-bold">
            {result?.reason === "unavailable"
              ? t("join.errors.unavailable")
              : t("join.tokenNotFound.title")}
          </h1>
          <p className="text-muted">{t("join.tokenNotFound.body")}</p>
          <Link href="/join" className="btn btn-primary">
            {t("join.tokenNotFound.cta")}
          </Link>
        </section>
      )}
    </main>
  );
}
