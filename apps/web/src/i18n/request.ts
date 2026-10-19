import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import type { Locale } from "@kj/i18n";
import { routing } from "./routing";

// Static imports per locale so the bundler can resolve them through the package exports map.
const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  he: () => import("@kj/i18n/messages/he.json"),
  en: () => import("@kj/i18n/messages/en.json"),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await loaders[locale]()).default,
  };
});
