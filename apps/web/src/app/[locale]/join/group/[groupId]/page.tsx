import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { isQrToken } from "@/lib/join-code";
import { createServerSupabase } from "@/lib/supabase/server";
import { loginPath } from "@/lib/urls";
import { JoinShell, NotConfiguredHint } from "../../JoinShell";

export const dynamic = "force-dynamic";

/** Invite link shared from the guest home: joins the signed-in user to that group. */
export default async function JoinGroupPage({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");

  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <JoinShell>
        <h1 className="text-3xl font-bold">{t("group.title")}</h1>
        <NotConfiguredHint />
      </JoinShell>
    );
  }

  if (!isQrToken(groupId)) return <InviteInvalid />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPath(locale, `/${locale}/join/group/${groupId}`));

  const { data, error } = await supabase.rpc("join_group", { p_group_id: groupId.toLowerCase() });
  const result = data?.[0];
  if (error || !result || result.status !== "joined") return <InviteInvalid />;

  redirect(`/${locale}/app?joined=1`);
}

async function InviteInvalid() {
  const t = await getTranslations("join");
  return (
    <JoinShell>
      <section className="card flex flex-col gap-4 p-5" data-testid="invite-invalid">
        <h1 className="text-2xl font-bold">{t("group.notFound.title")}</h1>
        <p className="text-muted">{t("group.notFound.body")}</p>
        <Link href="/join" className="btn btn-secondary">
          {t("notFound.retry")}
        </Link>
      </section>
    </JoinShell>
  );
}
