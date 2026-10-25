/**
 * Accessibility settings a guest or DJ picks in the app (the accessibility menu in the footer).
 * They live in this browser only (localStorage key `kj.a11y`, never sent to the server) and are
 * applied as `data-*` attributes on `<html>`, which globals.css turns into larger text, higher
 * contrast, no motion and underlined links. The operating system's own settings (text size,
 * reduced motion) keep working without any of this.
 */
export type TextSize = "default" | "large" | "larger";

export type A11yPreferences = {
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
};

export const A11Y_STORAGE_KEY = "kj.a11y";

export const TEXT_SIZES: readonly TextSize[] = ["default", "large", "larger"];

export const DEFAULT_PREFERENCES: A11yPreferences = {
  textSize: "default",
  highContrast: false,
  reduceMotion: false,
  underlineLinks: false,
};

/** Read stored preferences, falling back to the defaults for anything missing or malformed. */
export function parsePreferences(raw: string | null): A11yPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
  const v = value as Record<string, unknown>;
  return {
    textSize: TEXT_SIZES.includes(v.textSize as TextSize)
      ? (v.textSize as TextSize)
      : DEFAULT_PREFERENCES.textSize,
    highContrast: v.highContrast === true,
    reduceMotion: v.reduceMotion === true,
    underlineLinks: v.underlineLinks === true,
  };
}

/** The `<html>` attributes for a set of preferences; defaults produce none. */
export function preferenceAttributes(p: A11yPreferences): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (p.textSize !== "default") attrs["data-a11y-text"] = p.textSize;
  if (p.highContrast) attrs["data-a11y-contrast"] = "high";
  if (p.reduceMotion) attrs["data-a11y-motion"] = "reduce";
  if (p.underlineLinks) attrs["data-a11y-links"] = "underline";
  return attrs;
}

export const PREFERENCE_ATTRIBUTE_NAMES = [
  "data-a11y-text",
  "data-a11y-contrast",
  "data-a11y-motion",
  "data-a11y-links",
] as const;

/**
 * Inline script for the root layout: applies stored preferences before first paint, so a guest
 * who chose large text never sees the page jump. Kept tiny and dependency-free; mirrors
 * `parsePreferences` + `preferenceAttributes` (a unit test runs both on the same inputs).
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  A11Y_STORAGE_KEY,
)})||"{}"),d=document.documentElement;if(p.textSize==="large"||p.textSize==="larger")d.setAttribute("data-a11y-text",p.textSize);if(p.highContrast===true)d.setAttribute("data-a11y-contrast","high");if(p.reduceMotion===true)d.setAttribute("data-a11y-motion","reduce");if(p.underlineLinks===true)d.setAttribute("data-a11y-links","underline")}catch(e){}})();`;
