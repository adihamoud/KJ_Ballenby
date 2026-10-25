"use client";

import { useTranslations } from "next-intl";

/**
 * First tab stop on every page (root layout): hidden until focused, then jumps past the header
 * and navigation to the page's `<main id="main">` (WCAG 2.4.1 Bypass Blocks). Focus is moved by
 * hand as well: following a fragment scrolls, but not every browser moves keyboard focus.
 */
export function SkipLink() {
  const t = useTranslations("a11y");
  return (
    <a
      href="#main"
      data-testid="skip-link"
      className="bg-brand-2-fill fixed start-3 top-3 z-[100] -translate-y-24 rounded-full px-4 py-3 font-bold text-white shadow-lg focus-visible:translate-y-0"
      onClick={(e) => {
        const main = document.getElementById("main");
        if (!main) return;
        e.preventDefault();
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      {t("skipToContent")}
    </a>
  );
}
