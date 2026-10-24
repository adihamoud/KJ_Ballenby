"use client";

import { useLocale, useTranslations } from "next-intl";
import { locales, localeNames } from "@kj/i18n";
import { usePathname } from "@/i18n/navigation";

/**
 * Switches the locale with a full navigation rather than the client router: the router runs
 * inside a React transition, and React 19 holds that transition back until every in-flight
 * async action on the page (queue refreshes, realtime hints) has settled, which on a busy night
 * left the switch hanging for seconds. A document load is instant and keeps all state (cookies).
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("common");

  return (
    <label className="text-muted flex items-center gap-2 text-sm">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="bg-surface-2 border-border rounded-full border px-3 py-1.5 text-sm text-inherit"
        value={locale}
        onChange={(e) => {
          const next = e.target.value as (typeof locales)[number];
          const path = pathname === "/" ? "" : pathname;
          window.location.assign(`/${next}${path}${window.location.search}`);
        }}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
