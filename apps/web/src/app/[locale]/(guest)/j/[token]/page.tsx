import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { QrIcon } from "@/components/icons";
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
  const [result, session] = await Promise.all([
    code ? resolveTable(code) : Promise.resolve(null),
    getGuestSession(),
  ]);

  if (result?.ok && session?.tableId === result.table.table_id) {
    redirect({ href: "/guest", locale });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5">
      <GuestHeader />

      {result?.ok ? (
        <>
          <div className="flex flex-col gap-2 pt-2">
            <p className="eyebrow text-brand">{result.table.venue_name}</p>
            <h1 className="text-3xl font-black tracking-tight">
              {t("join.joining", { table: result.table.table_label })}
            </h1>
            <p className="text-muted">{t("join.nameHint")}</p>
          </div>
          <JoinForm locale={locale} lockedCode={code ?? undefined} name={session?.name ?? ""} />
        </>
      ) : (
        <section className="card flex flex-col items-center gap-4 p-6 text-center">
          <span className="bg-surface-3 text-muted flex size-14 items-center justify-center rounded-2xl">
            <QrIcon size={28} />
          </span>
          <h1 className="text-2xl font-black tracking-tight">
            {result?.reason === "unavailable"
              ? t("join.errors.unavailable")
              : t("join.tokenNotFound.title")}
          </h1>
          <p className="text-muted text-pretty">{t("join.tokenNotFound.body")}</p>
          <Link href="/join" className="btn btn-primary w-full">
            {t("join.tokenNotFound.cta")}
          </Link>
        </section>
      )}
    </main>
  );
}
