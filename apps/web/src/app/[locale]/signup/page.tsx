import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthScreen } from "@/components/auth/AuthScreen";

// Redirects signed-in users, so it must read cookies at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthScreen mode="signup" locale={locale} />;
}
