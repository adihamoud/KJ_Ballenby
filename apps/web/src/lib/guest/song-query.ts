// Pure helpers shared by the client search component and the server search code.
// No imports from server-only modules here.

export const SONG_QUERY_MAX = 60;
export const SONG_LANGUAGES = ["he", "en"] as const;
export type SongLanguage = (typeof SONG_LANGUAGES)[number];

export function normalizeSongQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SONG_QUERY_MAX);
}

export function normalizeSongLanguage(raw: string | null | undefined): SongLanguage | null {
  return (SONG_LANGUAGES as readonly string[]).includes(raw ?? "") ? (raw as SongLanguage) : null;
}
