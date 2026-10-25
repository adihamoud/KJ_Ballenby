import type { SearchSongRow } from "@kj/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { searchDemoCatalog } from "./demo-catalog";
import { SONG_SEARCH_LIMIT, type SongLanguage } from "./song-query";

export type SearchSongsResult =
  { ok: true; songs: SearchSongRow[] } | { ok: false; reason: "unavailable" };

/**
 * Catalog search for the guest's venue via the anonymous `search_songs` RPC.
 * An empty query browses the catalog alphabetically. Falls back to the in-memory demo
 * catalog when Supabase is not configured.
 */
export async function searchSongs(
  venueId: string,
  query: string,
  language: SongLanguage | null = null,
): Promise<SearchSongsResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: true, songs: searchDemoCatalog(query, language) };

  const { data, error } = await supabase.rpc("search_songs", {
    p_venue_id: venueId,
    p_query: query,
    p_language: language,
    p_limit: SONG_SEARCH_LIMIT,
  });
  if (error) {
    console.error("search_songs failed", { venueId, query, message: error.message });
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, songs: data ?? [] };
}
