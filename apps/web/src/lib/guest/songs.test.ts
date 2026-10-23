import { DEMO_CATALOG, searchDemoCatalog } from "./demo-catalog";
import { normalizeSongLanguage, normalizeSongQuery } from "./song-query";

describe("demo catalog", () => {
  it("has at least 10 songs and every song has at least one YouTube version", () => {
    expect(DEMO_CATALOG.length).toBeGreaterThanOrEqual(10);
    for (const s of DEMO_CATALOG) expect(s.videos.length).toBeGreaterThan(0);
  });

  it("has several songs with two or more versions", () => {
    const multi = DEMO_CATALOG.filter((s) => s.videos.length >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(2);
  });

  it("uses unique, well-formed YouTube ids", () => {
    const ids = DEMO_CATALOG.flatMap((s) => s.videos.map((v) => v.youtube_id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it("searches title and artist in both scripts, case-insensitively", () => {
    expect(searchDemoCatalog("queen").map((s) => s.title)).toEqual([
      "Bohemian Rhapsody",
      "Dancing Queen",
    ]);
    expect(searchDemoCatalog("חיים").map((s) => s.title)).toEqual(["תודה"]);
    expect(searchDemoCatalog("zzz")).toEqual([]);
  });

  it("filters by language and browses alphabetically on an empty query", () => {
    const he = searchDemoCatalog("", "he");
    expect(he.length).toBeGreaterThan(0);
    expect(he.every((s) => s.language === "he")).toBe(true);
    const all = searchDemoCatalog("");
    expect(all.length).toBe(DEMO_CATALOG.length);
  });
});

describe("query normalization", () => {
  it("collapses whitespace and caps length", () => {
    expect(normalizeSongQuery("  bohemian   rhapsody ")).toBe("bohemian rhapsody");
    expect(normalizeSongQuery("x".repeat(80))).toHaveLength(60);
    expect(normalizeSongQuery(undefined)).toBe("");
  });

  it("accepts only known languages", () => {
    expect(normalizeSongLanguage("he")).toBe("he");
    expect(normalizeSongLanguage("en")).toBe("en");
    expect(normalizeSongLanguage("fr")).toBeNull();
    expect(normalizeSongLanguage(null)).toBeNull();
  });
});
