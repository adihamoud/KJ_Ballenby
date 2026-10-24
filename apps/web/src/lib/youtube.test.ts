import { formatDuration, isYoutubeId, youtubeThumbnailUrl, youtubeWatchUrl } from "./youtube";

describe("youtube helpers", () => {
  it("validates 11-character ids", () => {
    expect(isYoutubeId("9Lxm0iSnKNc")).toBe(true);
    expect(isYoutubeId("i3SeJ6-sr5o")).toBe(true);
    expect(isYoutubeId("_nHT_k9Rswc")).toBe(true);
    expect(isYoutubeId("tooshort")).toBe(false);
    expect(isYoutubeId("has space 1")).toBe(false);
  });

  it("builds watch and thumbnail urls from the id", () => {
    expect(youtubeWatchUrl("OLLQsUlesD4")).toBe("https://www.youtube.com/watch?v=OLLQsUlesD4");
    expect(youtubeThumbnailUrl("OLLQsUlesD4")).toBe(
      "https://i.ytimg.com/vi/OLLQsUlesD4/mqdefault.jpg",
    );
    expect(youtubeThumbnailUrl("OLLQsUlesD4", "hq")).toBe(
      "https://i.ytimg.com/vi/OLLQsUlesD4/hqdefault.jpg",
    );
  });

  it("formats durations as m:ss", () => {
    expect(formatDuration(375)).toBe("6:15");
    expect(formatDuration(61)).toBe("1:01");
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
  });
});
