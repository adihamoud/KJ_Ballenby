import { cleanText } from "./normalize";
import type { RawSong } from "./normalize";

/** Which song field a CSV column feeds. */
export type CsvField = "title" | "artist" | "language" | "duration" | "externalRef";

// Header names accepted per field, compared after lower-casing and dropping spaces, `_` and `-`.
const HEADER_ALIASES: Record<CsvField, readonly string[]> = {
  title: [
    "title",
    "song",
    "songtitle",
    "songname",
    "name",
    "track",
    "שיר",
    "שםהשיר",
    "שםשיר",
    "כותרת",
    "שם",
  ],
  artist: [
    "artist",
    "artistname",
    "singer",
    "performer",
    "author",
    "אמן",
    "זמר",
    "זמרת",
    "מבצע",
    "שםהאמן",
  ],
  language: ["language", "lang", "שפה"],
  duration: ["duration", "durationsec", "length", "songlength", "time", "אורך", "משך", "זמן"],
  externalRef: [
    "externalref",
    "file",
    "filepath",
    "path",
    "location",
    "filename",
    "ref",
    "קובץ",
    "נתיב",
  ],
};

function headerKey(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
}

/** Column index per field; the first matching column wins. */
export function mapHeader(header: readonly string[]): Partial<Record<CsvField, number>> {
  const map: Partial<Record<CsvField, number>> = {};
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const field of Object.keys(HEADER_ALIASES) as CsvField[]) {
      if (map[field] === undefined && HEADER_ALIASES[field].includes(key)) map[field] = index;
    }
  });
  return map;
}

/** The delimiter (`,`, `;` or tab) that occurs most often outside quotes on the first line. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ",";
  for (const [delimiter, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

/** RFC 4180 records: quoted fields may hold delimiters, doubled quotes and line breaks. */
export function parseCsvRecords(text: string, delimiter = detectDelimiter(text)): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((cell) => cleanText(cell) !== ""));
}

export type CsvParseResult =
  { ok: true; songs: RawSong[] } | { ok: false; error: "empty" | "noTitleColumn" };

/**
 * Songs from a CSV with a header row. A title (or file path) column is required; artist may come
 * from its own column or from file names in the path column.
 */
export function parseCsv(text: string): CsvParseResult {
  const records = parseCsvRecords(text);
  const header = records[0];
  if (!header) return { ok: false, error: "empty" };
  const map = mapHeader(header);
  if (map.title === undefined && map.externalRef === undefined) {
    return { ok: false, error: "noTitleColumn" };
  }
  const cell = (record: readonly string[], field: CsvField) => {
    const index = map[field];
    return index === undefined ? undefined : record[index];
  };
  const songs = records.slice(1).map((record) => ({
    title: cell(record, "title"),
    artist: cell(record, "artist"),
    language: cell(record, "language"),
    duration: cell(record, "duration"),
    externalRef: cell(record, "externalRef"),
  }));
  return { ok: true, songs };
}

/** The header line of the downloadable template; every alias above is also accepted. */
export const CSV_TEMPLATE = "title,artist,language,duration,file\n";
