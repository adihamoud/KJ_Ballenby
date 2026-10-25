import type { RawSong } from "./normalize";

/**
 * VirtualDJ exports, read with a small attribute scanner instead of a DOM parser so the same code
 * runs in the browser and in unit tests and stays fast on a 20 MB `database.xml`.
 *
 * - `database.xml`: `<VirtualDJ_Database>` with one `<Song FilePath="...">` per file, holding
 *   `<Tags Author="..." Title="..."/>` and `<Infos SongLength="232.4"/>`.
 * - Playlists and saved folders (`.vdjfolder`): `<VirtualFolder>` with
 *   `<song path="..." artist="..." title="..." songlength="..."/>`.
 */

export type VirtualDjFormat = "vdj-database" | "vdj-folder";

const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const DB_SONG_RE = /<Song\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Song\s*>)/g;
const FOLDER_SONG_RE = /<song\b([^>]*?)\/?>/g;
const TAGS_RE = /<Tags\b([^>]*?)\/?>/;
const INFOS_RE = /<Infos\b([^>]*?)\/?>/;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith("#")) {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Attributes of one tag, keyed by lower-cased name. */
export function readAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1]?.toLowerCase();
    if (name) attrs[name] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

export function detectVirtualDj(text: string): VirtualDjFormat | null {
  const head = text.slice(0, 4096);
  if (/<VirtualDJ_Database\b/i.test(head)) return "vdj-database";
  if (/<VirtualFolder\b/i.test(head)) return "vdj-folder";
  return null;
}

export function parseVirtualDj(text: string, format: VirtualDjFormat): RawSong[] {
  const songs: RawSong[] = [];
  if (format === "vdj-database") {
    for (const match of text.matchAll(DB_SONG_RE)) {
      const song = readAttributes(match[1] ?? "");
      const body = match[2] ?? "";
      const tags = readAttributes(TAGS_RE.exec(body)?.[1] ?? "");
      const infos = readAttributes(INFOS_RE.exec(body)?.[1] ?? "");
      songs.push({
        title: tags.title,
        artist: tags.author ?? tags.artist,
        language: tags.language,
        duration: infos.songlength,
        externalRef: song.filepath,
      });
    }
  } else {
    for (const match of text.matchAll(FOLDER_SONG_RE)) {
      const song = readAttributes(match[1] ?? "");
      songs.push({
        title: song.title,
        artist: song.artist ?? song.author,
        language: song.language,
        duration: song.songlength,
        externalRef: song.path ?? song.filepath,
      });
    }
  }
  return songs;
}
