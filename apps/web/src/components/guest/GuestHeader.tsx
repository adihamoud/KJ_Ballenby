import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/guest/Brand";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

/**
 * Top bar of every guest page: the brand on the start side, the language switch on the end. Wraps
 * onto two lines when text is enlarged on a narrow phone instead of scrolling sideways.
 */
export async function GuestHeader({ brandLink = true }: { brandLink?: boolean }) {
  const t = await getTranslations("common");
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Brand name={t("appName")} asLink={brandLink} />
      <LocaleSwitcher />
    </header>
  );
}
