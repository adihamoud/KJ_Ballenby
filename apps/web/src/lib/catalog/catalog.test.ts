import { detectDelimiter, mapHeader, parseCsvRecords } from "./csv";
import { finishImport, mergeChunk } from "./merge";
import type { CatalogSong } from "./merge";
import {
  cleanText,
  cleanTitle,
  parseDuration,
  resolveLanguage,
  sanitizeRow,
  splitFileName,
  TITLE_MAX,
} from "./normalize";
import type { CatalogRow } from "./normalize";
import {
  chunkRows,
  decodeCatalogBytes,
  MAX_ROWS,
  parseCatalogBytes,
  parseCatalogText,
} from "./parse";
import type { ParsedCatalog } from "./parse";
import { decodeEntities, detectVirtualDj } from "./virtualdj";

function parsed(text: string): ParsedCatalog {
  const result = parseCatalogText(text);
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.catalog;
}

describe("normalize", () => {
  it("collapses whitespace, NBSP and direction marks", () => {
    expect(cleanText("  Bohemian\u00a0\u00a0Rhapsody\t\n")).toBe("Bohemian Rhapsody");
    expect(cleanText("\u200fהללויה\u200f")).toBe("הללויה");
    expect(cleanText(42)).toBe("");
  });

  it("strips karaoke and featuring tags from titles", () => {
    expect(cleanTitle("Shallow (Karaoke Version)")).toBe("Shallow");
    expect(cleanTitle("Toy [feat. Someone]")).toBe("Toy");
    expect(cleanTitle("Despacito (ft. Justin Bieber)")).toBe("Despacito");
    expect(cleanTitle("Wonderwall - Karaoke")).toBe("Wonderwall");
    expect(cleanTitle("הללויה (קריוקי)")).toBe("הללויה");
    // Brackets that are part of the title stay.
    expect(cleanTitle("(I Can't Get No) Satisfaction")).toBe("(I Can't Get No) Satisfaction");
    // Nothing left after stripping: keep the original.
    expect(cleanTitle("(Karaoke)")).toBe("(Karaoke)");
  });

  it("resolves the language from the file or the script", () => {
    expect(resolveLanguage("EN", "x", "y")).toBe("en");
    expect(resolveLanguage("Hebrew", "x", "y")).toBe("he");
    expect(resolveLanguage("עברית", "x", "y")).toBe("he");
    expect(resolveLanguage("fr", "x", "y")).toBe("fr");
    expect(resolveLanguage("", "הללויה", "Gali Atari")).toBe("he");
    expect(resolveLanguage(null, "Toy", "נטע")).toBe("en");
    expect(resolveLanguage(undefined, "1999", "נטע")).toBe("he");
    expect(resolveLanguage("klingon", "123", "456")).toBeNull();
  });

  it("parses durations in seconds and clock formats", () => {
    expect(parseDuration("215")).toBe(215);
    expect(parseDuration("232.45")).toBe(232);
    expect(parseDuration("232,6")).toBe(233);
    expect(parseDuration("3:35")).toBe(215);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration(180)).toBe(180);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("999999")).toBeNull();
  });

  it("splits Artist - Title file names and drops disc codes", () => {
    expect(splitFileName("C:\\Karaoke\\SF001-01 - Queen - Bohemian Rhapsody.cdg")).toEqual({
      artist: "Queen",
      title: "Bohemian Rhapsody",
    });
    expect(splitFileName("/music/ABBA - Dancing Queen.mp4")).toEqual({
      artist: "ABBA",
      title: "Dancing Queen",
    });
    expect(splitFileName("D:\\k\\Netta_-_Toy.kfn")).toEqual({ artist: "Netta", title: "Toy" });
    expect(splitFileName("C:\\k\\untitled.mp3")).toEqual({ artist: "", title: "untitled" });
  });

  it("sanitizes untrusted rows from the browser", () => {
    expect(sanitizeRow(null)).toBeNull();
    expect(sanitizeRow(["Toy", "Netta"])).toBeNull();
    expect(sanitizeRow({ title: " ", artist: "Netta" })).toBeNull();
    expect(
      sanitizeRow({
        title: "Toy",
        artist: "Netta",
        language: "<b>",
        duration_sec: "abc",
        extra: 1,
      }),
    ).toEqual({
      title: "Toy",
      artist: "Netta",
      language: "en",
      duration_sec: null,
      external_ref: null,
    });
    const long = sanitizeRow({ title: "x".repeat(TITLE_MAX + 50), artist: "a" });
    expect(long?.title).toHaveLength(TITLE_MAX);
  });
});

describe("csv", () => {
  it("detects the delimiter outside quotes", () => {
    expect(detectDelimiter("title,artist\n")).toBe(",");
    expect(detectDelimiter("title;artist;language\n")).toBe(";");
    expect(detectDelimiter("title\tartist\n")).toBe("\t");
    expect(detectDelimiter('"a;b;c",artist\n')).toBe(",");
  });

  it("reads quoted fields with delimiters, quotes and line breaks", () => {
    const records = parseCsvRecords(
      'title,artist\r\n"Hello, Goodbye","The ""Fab"" Four"\r\n"Two\nLines",X\n\n',
    );
    expect(records).toEqual([
      ["title", "artist"],
      ["Hello, Goodbye", 'The "Fab" Four'],
      ["Two\nLines", "X"],
    ]);
  });

  it("maps English and Hebrew headers", () => {
    expect(mapHeader(["Song Title", "Artist", "Lang", "Length", "File Path"])).toEqual({
      title: 0,
      artist: 1,
      language: 2,
      duration: 3,
      externalRef: 4,
    });
    expect(mapHeader(["שם השיר", "זמר", "שפה"])).toEqual({ title: 0, artist: 1, language: 2 });
  });

  it("parses a CSV into rows with counts", () => {
    const catalog = parsed(
      [
        "title,artist,language,duration,file",
        "Bohemian Rhapsody,Queen,en,5:54,C:\\k\\q.mp4",
        "bohemian rhapsody,QUEEN,,,",
        ",Nobody,,,",
        "הללויה,גלי עטרי,,180,",
        ",,,,C:\\k\\ABBA - Dancing Queen.cdg",
      ].join("\n"),
    );
    expect(catalog.format).toBe("csv");
    expect(catalog.total).toBe(5);
    expect(catalog.skipped).toBe(1);
    expect(catalog.duplicates).toBe(1);
    expect(catalog.rows).toEqual([
      {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        language: "en",
        duration_sec: 354,
        external_ref: "C:\\k\\q.mp4",
      },
      {
        title: "הללויה",
        artist: "גלי עטרי",
        language: "he",
        duration_sec: 180,
        external_ref: null,
      },
      {
        title: "Dancing Queen",
        artist: "ABBA",
        language: "en",
        duration_sec: null,
        external_ref: "C:\\k\\ABBA - Dancing Queen.cdg",
      },
    ]);
  });

  it("rejects a CSV without a title or file column", () => {
    expect(parseCatalogText("foo,bar\n1,2\n")).toEqual({ ok: false, error: "noTitleColumn" });
    expect(parseCatalogText(" \n\n")).toEqual({ ok: false, error: "empty" });
  });
});

describe("virtualdj", () => {
  it("decodes XML entities", () => {
    expect(decodeEntities("Simon &amp; Garfunkel &quot;x&quot; &#1492;&#x5DC;")).toBe(
      'Simon & Garfunkel "x" הל',
    );
    expect(decodeEntities("&unknown;")).toBe("&unknown;");
  });

  it("detects the export kind from the root element", () => {
    expect(detectVirtualDj('<?xml version="1.0"?>\n<VirtualDJ_Database Version="2024">')).toBe(
      "vdj-database",
    );
    expect(detectVirtualDj("<VirtualFolder>")).toBe("vdj-folder");
    expect(detectVirtualDj("<rss>")).toBeNull();
    expect(parseCatalogText("<rss><item/></rss>")).toEqual({ ok: false, error: "unknownXml" });
  });

  it("reads database.xml songs with tags, length and file path", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VirtualDJ_Database Version="8.5">
 <Song FilePath="C:\\Karaoke\\Queen - Bohemian Rhapsody.mp4" FileSize="1234">
  <Tags Author="Queen" Title="Bohemian Rhapsody (Karaoke Version)" Genre="Karaoke" Flag="1" />
  <Infos SongLength="354.71" FirstSeen="1700000000" />
 </Song>
 <Song FilePath="C:\\Karaoke\\SF012-03 - Simon &amp; Garfunkel - The Boxer.cdg">
  <Infos SongLength="300" />
 </Song>
 <Song FilePath="C:\\Karaoke\\noise.wav" />
 <Song FilePath="C:\\Karaoke\\dup.mp4"><Tags Author="queen" Title="bohemian rhapsody" /></Song>
</VirtualDJ_Database>`;
    const catalog = parsed(xml);
    expect(catalog.format).toBe("vdj-database");
    expect(catalog.total).toBe(4);
    expect(catalog.skipped).toBe(1);
    expect(catalog.duplicates).toBe(1);
    expect(catalog.rows).toEqual([
      {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        language: "en",
        duration_sec: 355,
        external_ref: "C:\\Karaoke\\Queen - Bohemian Rhapsody.mp4",
      },
      {
        title: "The Boxer",
        artist: "Simon & Garfunkel",
        language: "en",
        duration_sec: 300,
        external_ref: "C:\\Karaoke\\SF012-03 - Simon & Garfunkel - The Boxer.cdg",
      },
    ]);
  });

  it("reads a saved folder / playlist", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VirtualFolder>
<song path="D:\\k\\toy.mp4" size="1" songlength="180.2" bpm="0.5" artist="נטע" title="Toy" idx="0" />
<song path="D:\\k\\h.mp4" artist='גלי עטרי' title='הללויה' idx="1"/>
</VirtualFolder>`;
    const catalog = parsed(xml);
    expect(catalog.format).toBe("vdj-folder");
    expect(catalog.rows).toEqual([
      {
        title: "Toy",
        artist: "נטע",
        language: "en",
        duration_sec: 180,
        external_ref: "D:\\k\\toy.mp4",
      },
      {
        title: "הללויה",
        artist: "גלי עטרי",
        language: "he",
        duration_sec: null,
        external_ref: "D:\\k\\h.mp4",
      },
    ]);
  });
});

describe("parse", () => {
  it("decodes UTF-8 with BOM, UTF-16 and Windows-1255", () => {
    const utf8 = new TextEncoder().encode("\ufefftitle,artist\nהללויה,גלי\n");
    expect(parsed(decodeCatalogBytes(utf8)).rows[0]?.title).toBe("הללויה");

    const text = "title,artist\nToy,נטע\n";
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      utf16[2 + i * 2] = code & 0xff;
      utf16[3 + i * 2] = code >> 8;
    }
    expect(parsed(decodeCatalogBytes(utf16)).rows[0]?.artist).toBe("נטע");

    // "title,artist\nToy,נטע" in Windows-1255: Hebrew letters are 0xE0-0xFA.
    const ascii = Array.from("title,artist\nToy,", (c) => c.charCodeAt(0));
    const cp1255 = new Uint8Array([...ascii, 0xf0, 0xe8, 0xf2, 0x0a]);
    expect(parsed(decodeCatalogBytes(cp1255)).rows[0]?.artist).toBe("נטע");
  });

  it("enforces the file size and row limits", () => {
    expect(parseCatalogBytes(new Uint8Array(26_214_401))).toEqual({ ok: false, error: "tooLarge" });
    const many = [
      "title,artist",
      ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => `t${i},a`),
    ].join("\n");
    expect(parseCatalogText(many)).toEqual({ ok: false, error: "tooManyRows" });
  });

  it("chunks rows", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 2)).toEqual([]);
  });
});

describe("demo merge", () => {
  const existing: CatalogSong[] = [
    {
      id: "s1",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      language: "en",
      duration_sec: 354,
      external_ref: null,
      is_active: true,
      last_import_id: null,
    },
    {
      id: "s2",
      title: "Wonderwall",
      artist: "Oasis",
      language: "en",
      duration_sec: 258,
      external_ref: null,
      is_active: false,
      last_import_id: null,
    },
    {
      id: "s3",
      title: "Toy",
      artist: "Netta",
      language: "en",
      duration_sec: 180,
      external_ref: null,
      is_active: true,
      last_import_id: null,
    },
  ];
  const row = (title: string, artist: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
    title,
    artist,
    language: null,
    duration_sec: null,
    external_ref: null,
    ...extra,
  });

  it("updates case-insensitive matches, keeps missing values and reactivates", () => {
    let n = 0;
    const result = mergeChunk(
      existing,
      [
        row("bohemian rhapsody", "QUEEN", { external_ref: "C:\\q.mp4" }),
        row("WONDERWALL", "oasis"),
        row("New", "Song"),
      ],
      "imp-1",
      () => `new-${++n}`,
    );
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(2);
    const queen = result.songs.find((s) => s.id === "s1");
    expect(queen).toMatchObject({
      title: "Bohemian Rhapsody",
      duration_sec: 354,
      external_ref: "C:\\q.mp4",
      last_import_id: "imp-1",
    });
    expect(result.songs.find((s) => s.id === "s2")?.is_active).toBe(true);
    expect(result.songs.find((s) => s.id === "new-1")).toMatchObject({
      title: "New",
      is_active: true,
    });
    // The input is not mutated.
    expect(existing[1]?.is_active).toBe(false);
  });

  it("deactivates only songs the import did not see, and never on an empty import", () => {
    const merged = mergeChunk(existing, [row("Toy", "Netta")], "imp-2").songs;
    const done = finishImport(merged, "imp-2", true);
    expect(done.ok && done.deactivated).toBe(1);
    expect(done.ok && done.songs.filter((s) => s.is_active).map((s) => s.id)).toEqual(["s3"]);
    expect(finishImport(existing, "imp-3", true)).toEqual({ ok: false, error: "nothingImported" });
    expect(finishImport(existing, "imp-3", false)).toMatchObject({ ok: true, deactivated: 0 });
  });
});
