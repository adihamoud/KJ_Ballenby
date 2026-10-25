import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { QrIcon } from "@/components/icons";
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
  // Without Supabase the demo venue is the only one, and its code is nowhere else on screen.
  const demo = !process.env.NEXT_PUBLIC_SUPABASE_URL;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5">
      <GuestHeader />

      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-black tracking-tight">{t("join.title")}</h1>
        <p className="text-muted text-pretty">{t("join.subtitle")}</p>
      </div>

      <JoinForm locale={locale} code={code} name={session?.name ?? ""} />

      <p className="text-muted flex items-start gap-3 px-1 text-sm leading-snug">
        <QrIcon size={20} className="text-brand-2 mt-0.5 shrink-0" />
        <span>{t("join.scanHint")}</span>
      </p>

      {demo && (
        <p className="text-faint px-1 text-center text-sm" data-testid="demo-hint">
          {t("join.demoHint", { code: "DEMO1" })}
        </p>
      )}

      {session && (
        <p className="card text-muted mt-auto p-4 text-center text-sm">
          {t("join.alreadyJoined", { table: session.tableLabel, venue: session.venueName })}{" "}
          <Link href="/guest" className="text-text font-semibold underline underline-offset-4">
            {t("join.backToTable")}
          </Link>
        </p>
      )}
    </main>
  );
}
