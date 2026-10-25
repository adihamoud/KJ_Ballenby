import {
  A11Y_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  PREFERENCES_BOOT_SCRIPT,
  parsePreferences,
  preferenceAttributes,
  preferencesFromAttributes,
} from "./preferences";

/** Run the inline boot script against a fake document and storage; return the attributes set. */
function boot(stored: string | null): Record<string, string> {
  const attrs: Record<string, string> = {};
  const localStorage = { getItem: (key: string) => (key === A11Y_STORAGE_KEY ? stored : null) };
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => (attrs[name] = value) },
  };
  new Function("localStorage", "document", PREFERENCES_BOOT_SCRIPT)(localStorage, document);
  return attrs;
}

const SAMPLES = [
  null,
  "",
  "not json",
  "null",
  "[]",
  "{}",
  JSON.stringify({ textSize: "large" }),
  JSON.stringify({ textSize: "larger", highContrast: true }),
  JSON.stringify({ textSize: "huge", reduceMotion: "yes", underlineLinks: true }),
  JSON.stringify({ highContrast: true, reduceMotion: true, underlineLinks: true }),
];

describe("accessibility preferences", () => {
  it("falls back to the defaults for missing or malformed storage", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{oops")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('"large"')).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid values and drops invalid ones", () => {
    expect(
      parsePreferences(JSON.stringify({ textSize: "huge", highContrast: true, extra: 1 })),
    ).toEqual({ ...DEFAULT_PREFERENCES, highContrast: true });
  });

  it("defaults produce no attributes on <html>", () => {
    expect(preferenceAttributes(DEFAULT_PREFERENCES)).toEqual({});
  });

  it("maps each preference to its attribute", () => {
    expect(
      preferenceAttributes({
        textSize: "larger",
        highContrast: true,
        reduceMotion: true,
        underlineLinks: true,
      }),
    ).toEqual({
      "data-a11y-text": "larger",
      "data-a11y-contrast": "high",
      "data-a11y-motion": "reduce",
      "data-a11y-links": "underline",
    });
  });

  it.each(SAMPLES)("the boot script agrees with the React code for %j", (stored) => {
    expect(boot(stored)).toEqual(preferenceAttributes(parsePreferences(stored)));
  });

  it("reads the applied preferences back from the <html> attributes", () => {
    for (const raw of SAMPLES) {
      const prefs = parsePreferences(raw);
      const attrs = preferenceAttributes(prefs);
      expect(preferencesFromAttributes((name) => attrs[name] ?? null)).toEqual(prefs);
    }
    expect(preferencesFromAttributes(() => null)).toEqual(DEFAULT_PREFERENCES);
    expect(preferencesFromAttributes(() => "bogus").textSize).toBe("default");
  });
});
