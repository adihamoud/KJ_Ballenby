import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLocale, dir, isLocale, locales } from "./index";

const here = dirname(fileURLToPath(import.meta.url));

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(here, "..", "messages", `${locale}.json`), "utf8"));
}

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? flattenKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("locales", () => {
  it("defaults to Hebrew, which is right-to-left", () => {
    expect(defaultLocale).toBe("he");
    expect(dir("he")).toBe("rtl");
    expect(dir("en")).toBe("ltr");
  });

  it("validates locale strings", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("message catalogs", () => {
  it("have identical key sets in every locale", () => {
    const [first, ...rest] = locales;
    const reference = flattenKeys(loadMessages(first)).sort();
    for (const locale of rest) {
      expect(flattenKeys(loadMessages(locale)).sort()).toEqual(reference);
    }
  });

  it("have no empty strings", () => {
    for (const locale of locales) {
      const messages = loadMessages(locale);
      const empties = flattenKeys(messages).filter((path) => {
        const value = path
          .split(".")
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], messages);
        return value === "";
      });
      expect(empties, `${locale} has empty messages`).toEqual([]);
    }
  });
});
