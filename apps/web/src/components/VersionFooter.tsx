import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildInfo, versionLabel } from "@/lib/version";

/**
 * Small footer at the bottom of every page (root layout): the privacy notice link, then the
 * release stamp when one was built. Hidden when printing.
 */
export async function VersionFooter() {
  const label = versionLabel(buildInfo());
  const [t, tPrivacy] = await Promise.all([getTranslations("common"), getTranslations("privacy")]);
  return (
    <footer className="text-faint py-4 text-center text-xs print:hidden">
      <Link
        href="/privacy"
        className="inline-flex min-h-11 items-center px-2 underline underline-offset-4"
        data-testid="footer-privacy"
      >
        {tPrivacy("links.footer")}
      </Link>
      {label && (
        <>
          {" · "}
          <span data-testid="app-version">
            {t("version")} <bdi dir="ltr">{label}</bdi>
          </span>
        </>
      )}
    </footer>
  );
}
