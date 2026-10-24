import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("dj");
  return { title: t("metaTitle") };
}

/**
 * The DJ console inside the venue admin. The console itself is rendered by the admin layout
 * (`AdminShell`) so it survives switching admin tabs; this route only selects it.
 */
export default async function AdminDjPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
