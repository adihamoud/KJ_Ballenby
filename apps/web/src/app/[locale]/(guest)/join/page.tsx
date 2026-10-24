import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { getGuestSession } from "@/lib/guest/session";
import { JoinForm } from "./JoinForm";

// Prefills from the guest cookie, so it must render at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("join");
  return { title: t("title") };
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations();
  const session = await getGuestSession();
  const code = typeof query.code === "string" ? query.code : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          {t("common.appName")}
        </Link>
        <LocaleSwitcher />
      </header>

      <div>
        <h1 className="text-3xl font-bold">{t("join.title")}</h1>
        <p className="text-muted mt-1">{t("join.subtitle")}</p>
      </div>

      <JoinForm locale={locale} code={code} name={session?.name ?? ""} />

      {session && (
        <p className="text-muted text-center text-sm">
          {t("join.alreadyJoined", { table: session.tableLabel, venue: session.venueName })}{" "}
          <Link href="/guest" className="text-text underline">
            {t("join.backToTable")}
          </Link>
        </p>
      )}
    </main>
  );
}
