import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { parseJoinCodeParam } from "@/lib/join-code";
import { createServerSupabase } from "@/lib/supabase/server";
import { joinPath, loginPath } from "@/lib/urls";
import { JoinShell, NotConfiguredHint } from "../JoinShell";

// Joins the signed-in user, so it must run per request.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("join");
  return { title: t("title") };
}

/**
 * Landing page of the printed QR (/join/<qr_token>) and of the typed code
 * (/join/<CODE>). Resolves the table, asks for sign-in if needed, then joins the
 * table's group for the open night and sends the guest to /app.
 */
export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code: rawCode } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");

  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <JoinShell>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <NotConfiguredHint />
        <RetryLink label={t("notFound.retry")} />
      </JoinShell>
    );
  }

  const code = parseJoinCodeParam(safeDecode(rawCode));
  if (!code) return <NotFoundScreen />;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Resolve before sign-in so the guest sees where they are about to land.
    const { data } = await supabase.rpc("resolve_table", { p_code: code });
    const resolved = data?.[0];
    if (!resolved) return <NotFoundScreen />;
    return (
      <JoinShell>
        <section className="card flex flex-col gap-4 p-5">
          <h1 className="text-2xl font-bold">
            {t("joinTable", { table: resolved.table_label, venue: resolved.venue_name })}
          </h1>
          <p className="text-muted">{t("signInHint")}</p>
          <a href={loginPath(locale, joinPath(locale, code))} className="btn btn-primary">
            {t("signInToJoin")}
          </a>
        </section>
      </JoinShell>
    );
  }

  const { data, error } = await supabase.rpc("join_table", { p_code: code });
  const result = data?.[0];
  if (error || !result) {
    return (
      <JoinShell>
        <section className="card flex flex-col gap-4 p-5">
          <h1 className="text-2xl font-bold">{t("errors.generic")}</h1>
          <RetryLink label={t("notFound.retry")} />
        </section>
      </JoinShell>
    );
  }

  if (result.status === "joined") redirect(`/${locale}/app?joined=1`);

  if (result.status === "no_open_night") {
    return (
      <JoinShell>
        <section className="card flex flex-col gap-4 p-5" data-testid="no-open-night">
          <h1 className="text-2xl font-bold">{t("noNight.title")}</h1>
          <p className="text-muted">
            {t("noNight.body", { venue: result.venue_name ?? "", table: result.table_label ?? "" })}
          </p>
          <a href={joinPath(locale, code)} className="btn btn-primary">
            {t("noNight.retry")}
          </a>
        </section>
      </JoinShell>
    );
  }

  return <NotFoundScreen />;
}

async function NotFoundScreen() {
  const t = await getTranslations("join");
  return (
    <JoinShell>
      <section className="card flex flex-col gap-4 p-5" data-testid="code-not-found">
        <h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
        <p className="text-muted">{t("notFound.body")}</p>
        <RetryLink label={t("notFound.retry")} />
      </section>
    </JoinShell>
  );
}

function RetryLink({ label }: { label: string }) {
  return (
    <Link href="/join" className="btn btn-secondary">
      {label}
    </Link>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
