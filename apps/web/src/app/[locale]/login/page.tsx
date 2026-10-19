import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/urls";
import { LoginForm } from "./LoginForm";

// Redirects signed-in users, so it must read cookies at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next: rawNext } = await searchParams;
  // Where to go after sign-in (e.g. back to the table the guest scanned).
  const next = safeNext(rawNext, `/${locale}/app`);

  const user = await getCurrentUser();
  if (user) redirect(next);

  const t = await getTranslations("login");
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-1">{t("subtitle")}</p>
      </div>
      <LoginForm locale={locale} configured={supabaseConfigured} next={next} />
    </main>
  );
}
