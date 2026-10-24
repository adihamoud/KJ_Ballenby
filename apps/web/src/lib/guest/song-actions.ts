"use server";

import type { SearchSongRow } from "@kj/db";
import { getGuestSession } from "./session";
import { normalizeSongLanguage, normalizeSongQuery } from "./song-query";
import { searchSongs } from "./songs";

export interface SongSearchResponse {
  songs: SearchSongRow[];
  error: "noSession" | "unavailable" | null;
}

/**
 * Search the catalog of the venue the guest joined. The venue comes from the guest cookie,
 * never from the client, so a guest can only browse their own venue's catalog.
 */
export async function searchSongsAction(
  rawQuery: string,
  rawLanguage: string | null,
): Promise<SongSearchResponse> {
  const session = await getGuestSession();
  if (!session) return { songs: [], error: "noSession" };

  const result = await searchSongs(
    session.venueId,
    normalizeSongQuery(rawQuery),
    normalizeSongLanguage(rawLanguage),
  );
  return result.ok ? { songs: result.songs, error: null } : { songs: [], error: "unavailable" };
}
