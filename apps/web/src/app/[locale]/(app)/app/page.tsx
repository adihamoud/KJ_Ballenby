import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function GuestHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const user = await getCurrentUser();

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

      <section className="card p-5">
        <p className="text-muted">{t("app.noNight")}</p>
      </section>

      <form action={`/${locale}/auth/signout`} method="post" className="mt-auto">
        <button type="submit" className="btn btn-secondary w-full">
          {t("app.signOut")}
        </button>
      </form>
    </main>
  );
}
