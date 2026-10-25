import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessibilityMenu } from "@/components/a11y/AccessibilityMenu";
import { buildInfo, versionLabel } from "@/lib/version";

/**
 * Bottom of every page (root layout): the accessibility settings, the accessibility statement
 * (required in Israel, docs/ACCESSIBILITY.md), the privacy notice and the release stamp when one
 * was built. Hidden when printing.
 */
export async function VersionFooter() {
  const label = versionLabel(buildInfo());
  const t = await getTranslations();
  const link =
    "text-muted inline-flex min-h-11 items-center px-2 text-sm underline underline-offset-4";
  return (
    <footer className="text-faint flex flex-col items-center gap-1 py-4 text-center text-xs print:hidden">
      <nav aria-label={t("a11y.footerNav")} className="flex flex-wrap justify-center gap-x-2">
        <AccessibilityMenu />
        <Link href="/accessibility" className={link}>
          {t("a11y.statement.link")}
        </Link>
        <Link href="/privacy" className={link} data-testid="footer-privacy">
          {t("privacy.links.footer")}
        </Link>
      </nav>
      {label && (
        <p data-testid="app-version">
          {t("common.version")} <bdi dir="ltr">{label}</bdi>
        </p>
      )}
    </footer>
  );
}
