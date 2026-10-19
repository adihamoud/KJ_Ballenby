export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "he";

export type TextDirection = "rtl" | "ltr";

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["he"]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function dir(locale: Locale): TextDirection {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export const localeNames: Record<Locale, string> = {
  he: "עברית",
  en: "English",
};
