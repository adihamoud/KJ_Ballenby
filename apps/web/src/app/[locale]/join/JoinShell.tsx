import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

/** Common frame for the public join pages. */
export async function JoinShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">{t("appName")}</span>
        <LocaleSwitcher />
      </header>
      {children}
    </main>
  );
}

/** Shown wherever Supabase env vars are missing (local preview, CI). */
export async function NotConfiguredHint() {
  const t = await getTranslations("common");
  return (
    <p className="card text-accent p-4 text-sm" data-testid="not-configured">
      {t("notConfigured")}
    </p>
  );
}
