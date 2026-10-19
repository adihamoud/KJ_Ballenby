"use client";

import { useLocale, useTranslations } from "next-intl";
import { locales, localeNames } from "@kj/i18n";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <label className="text-muted flex items-center gap-2 text-sm">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="bg-surface-2 border-border rounded-full border px-3 py-1.5 text-sm text-inherit"
        value={locale}
        onChange={(e) =>
          router.replace(pathname, { locale: e.target.value as (typeof locales)[number] })
        }
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
