import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { getAppOrigin } from "@/lib/origin";
import { getGuestSession } from "@/lib/supabase/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildGroupInviteUrl } from "@/lib/urls";
import { leaveGroup } from "./actions";
import { CreateGroupForm } from "./CreateGroupForm";
import { GroupMembers } from "./GroupMembers";
import { ShareLink } from "./ShareLink";

export default async function GuestHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ joined?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { joined } = await searchParams;
  const t = await getTranslations();

  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const session = supabase && user ? await getGuestSession(supabase, user.id) : null;

  const name =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email ??
    user?.phone ??
    "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">{t("common.appName")}</span>
        <LocaleSwitcher />
      </header>

      <h1 className="text-2xl font-bold">{t("app.welcome", { name })}</h1>

      {session && joined && (
        <p className="card border-brand-2 p-4 text-sm" role="status">
          {t("app.joinedToast", { group: session.group.name })}
        </p>
      )}

      {!session ? (
        <section className="card flex flex-col gap-4 p-5">
          <p className="text-muted">{t("app.noNight")}</p>
          <Link href="/join" className="btn btn-primary">
            {t("app.joinCta")}
          </Link>
        </section>
      ) : (
        <>
          <section className="card flex flex-col gap-3 p-5" data-testid="guest-session">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">{t("app.venue")}</dt>
              <dd className="font-medium">{session.venue.name}</dd>
              {session.table && (
                <>
                  <dt className="text-muted">{t("app.table")}</dt>
                  <dd className="font-medium">{session.table.label}</dd>
                </>
              )}
              <dt className="text-muted">{t("app.group")}</dt>
              <dd className="font-medium">{session.group.name}</dd>
            </dl>
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-semibold">{t("app.members.title")}</h2>
            <GroupMembers
              key={session.group.id}
              groupId={session.group.id}
              currentUserId={user?.id ?? ""}
              initialMembers={session.members}
            />
            <form action={leaveGroup}>
              <input type="hidden" name="groupId" value={session.group.id} />
              <button type="submit" className="btn btn-secondary w-full">
                {t("app.leave")}
              </button>
            </form>
          </section>

          {session.group.kind === "adhoc" && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="font-semibold">{t("app.share.title")}</h2>
              <p className="text-muted text-sm">{t("app.share.hint")}</p>
              <ShareLink
                url={buildGroupInviteUrl(await getAppOrigin(), locale, session.group.id)}
                title={session.group.name}
              />
            </section>
          )}

          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-semibold">{t("app.createGroup.title")}</h2>
            <p className="text-muted text-sm">{t("app.createGroup.hint")}</p>
            <CreateGroupForm tableId={session.table?.id ?? null} />
          </section>
        </>
      )}

      <form action={`/${locale}/auth/signout`} method="post" className="mt-auto">
        <button type="submit" className="btn btn-secondary w-full">
          {t("app.signOut")}
        </button>
      </form>
    </main>
  );
}
