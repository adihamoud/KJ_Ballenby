import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

// The reset link signs the user in through /auth/callback, then lands here.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || user.is_anonymous) redirect({ href: "/login", locale });

  const t = await getTranslations("auth.reset");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5">
      <GuestHeader />
      <div className="pt-2">
        <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
        <p className="text-muted mt-1">{t("subtitle")}</p>
      </div>
      <ResetPasswordForm locale={locale} />
    </main>
  );
}
