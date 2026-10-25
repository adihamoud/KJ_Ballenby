/**
 * Normalization shared by every catalog format (ADR-005, ADR-010): the browser applies it while
 * parsing, and the Server Action applies `sanitizeRow` again before rows reach the database, since
 * the client cannot be trusted. The SQL function `import_catalog_chunk` enforces the same limits.
 */

export const TITLE_MAX = 300;
export const ARTIST_MAX = 300;
export const EXTERNAL_REF_MAX = 1000;
// Raw titles are cut to this before the tag regexes run, so their cost stays bounded whatever the
// input length; tags past it would be cut by TITLE_MAX anyway.
const TITLE_RAW_MAX = TITLE_MAX * 2;
export const DURATION_MAX_SEC = 86_400;

/** One song as it is sent to `import_catalog_chunk`. */
export interface CatalogRow {
  title: string;
  artist: string;
  language: string | null;
  duration_sec: number | null;
  external_ref: string | null;
}

/** Trim, NFC-normalize and collapse every run of whitespace (tabs, NBSP, newlines) to a space. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\s\u00a0\u200e\u200f\ufeff]+/g, " ")
    .trim();
}

// Bracketed tags karaoke libraries add to titles: "(Karaoke Version)", "[feat. X]", "(Instrumental)".
const TITLE_TAG_RE =
  /\s*[([](?:[^)\]]*\b(?:karaoke|instrumental|feat\.?|ft\.|featuring|with lyrics|lyrics)(?!\w)[^)\]]*|[^)\]]*קריוקי[^)\]]*)[)\]]/giu;
const TITLE_SUFFIX_RE = /\s+-\s+(?:karaoke(?: version)?|instrumental|קריוקי)$/iu;

/** A title without karaoke/featuring tags; falls back to the plain cleaned title if nothing is left. */
export function cleanTitle(value: unknown): string {
  const cleaned = cleanText(value).slice(0, TITLE_RAW_MAX);
  const stripped = cleanText(cleaned.replace(TITLE_TAG_RE, "").replace(TITLE_SUFFIX_RE, ""));
  return stripped || cleaned;
}

const HEBREW_RE = /[\u0590-\u05ff]/u;
const LATIN_RE = /[A-Za-z]/;

const LANGUAGE_NAMES: Record<string, string> = {
  hebrew: "he",
  עברית: "he",
  heb: "he",
  iw: "he",
  english: "en",
  אנגלית: "en",
  eng: "en",
};

/**
 * ISO 639-1 code for a song. An explicit value from the file wins (codes or the names above);
 * otherwise Hebrew script in the title (then the artist) means `he` and Latin script means `en`,
 * which matches the guest search filter (`he`, `en`) for an Israeli venue. Anything else is null.
 */
export function resolveLanguage(given: unknown, title: string, artist: string): string | null {
  const raw = cleanText(given).toLowerCase();
  if (raw) {
    const named = LANGUAGE_NAMES[raw];
    if (named) return named;
    if (/^[a-z]{2}$/.test(raw)) return raw;
  }
  for (const text of [title, artist]) {
    if (HEBREW_RE.test(text)) return "he";
    if (LATIN_RE.test(text)) return "en";
  }
  return null;
}

/** Seconds from `215`, `215.4`, `3:35` or `1:02:03`; null when empty, invalid or out of range. */
export function parseDuration(value: unknown): number | null {
  let seconds: number;
  if (typeof value === "number") {
    seconds = value;
  } else {
    const raw = cleanText(value).replace(",", ".");
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      seconds = Number(raw);
    } else if (/^\d{1,3}(?::\d{1,2}){1,2}$/.test(raw)) {
      seconds = raw.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    } else {
      return null;
    }
  }
  if (!Number.isFinite(seconds)) return null;
  const rounded = Math.round(seconds);
  return rounded >= 1 && rounded <= DURATION_MAX_SEC ? rounded : null;
}

// Disc codes karaoke vendors put in front of file names: "SF001-01 - ", "SC8123-05 ", "ZM12 - ".
const DISC_CODE_RE = /^[A-Z]{2,6}\d{2,6}(?:[-_]\d{1,3})?\s*(?:-\s*)?/;
const EXTENSION_RE = /\.[A-Za-z0-9]{2,5}$/;

/**
 * Artist and title from a file path such as `C:\Karaoke\SF001-01 - Queen - Bohemian Rhapsody.cdg`
 * (the common "Artist - Title" naming). Used when a row has no tags.
 */
export function splitFileName(path: string): { artist: string; title: string } {
  const base = path.split(/[\\/]/).pop() ?? "";
  const name = cleanText(base.replace(EXTENSION_RE, "").replace(/_/g, " ")).replace(
    DISC_CODE_RE,
    "",
  );
  const parts = name
    .split(/\s+-\s+/)
    .map(cleanText)
    .filter(Boolean);
  if (parts.length >= 2) {
    return { artist: parts[0] ?? "", title: parts.slice(1).join(" - ") };
  }
  return { artist: "", title: parts[0] ?? "" };
}

export interface RawSong {
  title?: unknown;
  artist?: unknown;
  language?: unknown;
  duration?: unknown;
  externalRef?: unknown;
}

/**
 * A clean row, or null when the song has no usable title or artist. Missing tags fall back to the
 * file name of `externalRef`.
 */
export function toCatalogRow(raw: RawSong): CatalogRow | null {
  let title = cleanTitle(raw.title);
  let artist = cleanText(raw.artist);
  const externalRef = cleanText(raw.externalRef).slice(0, EXTERNAL_REF_MAX) || null;
  if ((!title || !artist) && externalRef) {
    const fromFile = splitFileName(externalRef);
    if (!title) title = cleanTitle(fromFile.title);
    if (!artist) artist = fromFile.artist;
  }
  if (!title || !artist) return null;
  title = title.slice(0, TITLE_MAX);
  artist = artist.slice(0, ARTIST_MAX);
  return {
    title,
    artist,
    language: resolveLanguage(raw.language, title, artist),
    duration_sec: parseDuration(raw.duration),
    external_ref: externalRef,
  };
}

/** Case-insensitive identity of a song, the same as the database's `lower(title), lower(artist)`. */
export function songKey(row: Pick<CatalogRow, "title" | "artist">): string {
  return `${row.title.toLowerCase()}\u0000${row.artist.toLowerCase()}`;
}

/**
 * Re-validate a row that came from the browser. Returns null for anything that is not a plain
 * object with a usable title and artist; every other field is coerced or dropped.
 */
export function sanitizeRow(input: unknown): CatalogRow | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  return toCatalogRow({
    title: record.title,
    artist: record.artist,
    language: record.language,
    duration: record.duration_sec,
    externalRef: record.external_ref,
  });
}
