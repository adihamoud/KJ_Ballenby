import { getTranslations, setRequestLocale } from "next-intl/server";
import { readSupabaseEnv } from "@kj/db";
import { JoinCodeForm } from "./JoinCodeForm";
import { JoinShell, NotConfiguredHint } from "./JoinShell";

export async function generateMetadata() {
  const t = await getTranslations("join");
  return { title: t("title") };
}

/** Manual join: type the table code. Public; sign-in happens after the code resolves. */
export default async function JoinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");
  const configured = readSupabaseEnv() !== null;

  return (
    <JoinShell>
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-1">{t("subtitle")}</p>
      </div>
      {!configured && <NotConfiguredHint />}
      <JoinCodeForm locale={locale} />
      <p className="text-muted text-center text-sm">{t("scanHint")}</p>
    </JoinShell>
  );
}
