import { getTranslations } from "next-intl/server";
import { buildInfo, versionLabel } from "@/lib/version";

/** Small release stamp at the bottom of every page (root layout). Hidden when printing. */
export async function VersionFooter() {
  const label = versionLabel(buildInfo());
  if (!label) return null;
  const t = await getTranslations("common");
  return (
    <footer className="text-faint py-4 text-center text-xs print:hidden" data-testid="app-version">
      {t("version")} <bdi dir="ltr">{label}</bdi>
    </footer>
  );
}
