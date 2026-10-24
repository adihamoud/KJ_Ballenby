import type { SearchSongRow, SongVideoSummary } from "@kj/db";

/**
 * In-memory copy of the demo venue catalog from `supabase/seed.sql` plus the YouTube
 * versions inserted by migration 20261023120000. Served when Supabase is not configured
 * (CI, previews without secrets) so the guest flow stays testable end to end.
 */

function video(
  youtube_id: string,
  label: string,
  duration_sec: number,
  embeddable = true,
): SongVideoSummary {
  return { youtube_id, label, duration_sec, embeddable };
}

let seq = 0;
function song(
  title: string,
  artist: string,
  language: "he" | "en",
  duration_sec: number,
  videos: SongVideoSummary[],
): SearchSongRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-0000000005${seq.toString().padStart(2, "0")}`,
    title,
    artist,
    language,
    duration_sec,
    videos,
  };
}

export const DEMO_CATALOG: readonly SearchSongRow[] = [
  song("Bohemian Rhapsody", "Queen", "en", 354, [
    video("9Lxm0iSnKNc", "Sing King", 375, false),
    video("xyF04rAhHaQ", "Starlight Karaoke", 346),
    video("yvEcMrstp80", "Zoom Karaoke (lyrics on screen)", 365),
  ]),
  song("Dancing Queen", "ABBA", "en", 231, [
    video("WHayJZ3eMcE", "Sing King", 256, false),
    video("qjMSGIfB1j8", "Atomic Karaoke (HD)", 233),
    video("7fCMws3U2zE", "KaraFun", 244, false),
  ]),
  song("Wonderwall", "Oasis", "en", 258, [
    video("R_EXyGWI9rU", "Sing King", 291, false),
    video("0BFeMQkYteo", "KaraFun", 253, false),
    video("i3SeJ6-sr5o", "Acoustic", 270),
  ]),
  song("Shallow", "Lady Gaga & Bradley Cooper", "en", 215, [
    video("_nHT_k9Rswc", "Sing King", 225, false),
    video("smu-0V7E7wI", "Mi Balmz", 228),
    video("b6I_YR1nlIY", "Piano", 253, false),
  ]),
  song("Toy", "Netta", "en", 180, [
    video("ejcycvyGzRs", "Sing King", 185, false),
    video("VcM01mLjNDg", "King Of Karaoke", 195),
  ]),
  song("Sweet Caroline", "Neil Diamond", "en", 225, [
    video("srLoAl1mhFw", "Sing King", 241, false),
    video("IM8pV2wedpc", "KaraFun", 234, false),
    video("UcWEfvu6F_s", "Atomic Karaoke (HD)", 225),
  ]),
  song("Don't Stop Believin'", "Journey", "en", 275, [
    video("c8wn2fMYvns", "Sing King", 276, false),
    video("YRFNMAFL5j0", "KaraFun", 258, false),
    video("1pOFPExPDCY", "Atomic Karaoke (HD)", 275),
  ]),
  song("I Will Survive", "Gloria Gaynor", "en", 230, [
    video("FsUa8P-L2Ag", "Sing King", 230, false),
    video("l7cJwvvWopk", "KaraFun", 206, false),
  ]),
  song("Livin' on a Prayer", "Bon Jovi", "en", 273, [
    video("Ep6G3P2v5ZA", "Sing King", 273, false),
    video("FDN5GYvEzvc", "KaraFun", 257, false),
  ]),
  song("הללויה", "גלי עטרי וחלב ודבש", "he", 180, [
    video("OLLQsUlesD4", "קריוקי", 204),
    video("0T6f9MZwgxE", "גרסה מקוצרת", 144),
    video("uuFKEL8b65I", "Eurovision 1979 (karaoké)", 209),
  ]),
  song("תודה", "חיים משה", "he", 240, [
    video("1Rq16P8tqlI", "קריוקי", 136),
    video("PeBNlOp5FuA", "Studio Lab", 222),
  ]),
  song("שיר לשלום", 'להקת הנח"ל', "he", 230, [
    video("f1mAdmZDL3g", "קריוקי פסנתר (שירי מימון)", 341),
    video("46Xjxx4p6KY", "PianoNati", 291),
  ]),
  song("אבניבי", "יזהר כהן", "he", 180, [
    video("h0Tm0KLzU4M", "בא-לי קריוקי", 184),
    video("r5raBI4kcoM", "Midi cover", 189),
  ]),
  song("דיווה", "דנה אינטרנשיונל", "he", 180, [
    video("FG3wuRnZuto", "עברית", 183),
    video("0DzkKK3sgJ8", "Party Tyme", 197),
    video("pKtSHCF89Mo", "English version", 188),
  ]),
];

/** Mirrors `search_songs`: substring on title/artist, optional language, alphabetical. */
export function searchDemoCatalog(
  query: string,
  language: string | null = null,
  limit = 30,
): SearchSongRow[] {
  const q = query.trim().toLowerCase();
  return DEMO_CATALOG.filter(
    (s) =>
      (language === null || s.language === language) &&
      (q === "" || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)),
  )
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, limit);
}
