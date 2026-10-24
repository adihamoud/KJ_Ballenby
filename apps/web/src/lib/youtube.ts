const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYoutubeId(value: string): boolean {
  return YOUTUBE_ID_RE.test(value);
}

/** Watch page for a video id. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Thumbnail served by YouTube's image CDN for any public video.
 * `mq` is 320x180 (list rows), `hq` is 480x360 (detail views).
 */
export function youtubeThumbnailUrl(id: string, size: "mq" | "hq" = "mq"): string {
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}

/** "3:45" style duration for list rows; null when unknown. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
