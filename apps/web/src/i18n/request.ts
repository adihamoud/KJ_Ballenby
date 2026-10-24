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
    // One `now` per request, inherited by NextIntlClientProvider, so relative times ("3 seconds
    // ago") hydrate to the same text they were server-rendered with. Clients tick from there.
    now: new Date(),
    // Israel-first product: clock times render in the venue's zone on server and client alike.
    // Per-venue time zones (venues.timezone) can replace this when venues span zones.
    timeZone: "Asia/Jerusalem",
  };
});
