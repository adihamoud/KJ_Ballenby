import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthScreen } from "@/components/auth/AuthScreen";

// Redirects signed-in users, so it must read cookies at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth.signin");
  return { title: t("title") };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  return <AuthScreen mode="signin" locale={locale} error={error} />;
}
