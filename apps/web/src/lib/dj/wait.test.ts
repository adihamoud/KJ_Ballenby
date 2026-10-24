import { demoSnapshot } from "./demo-night";
import { closeNightSnapshot, nowSinging, orderedQueue } from "./queue-model";
import type { DjSnapshot } from "./types";
import { CHANGEOVER_SEC, DEFAULT_SONG_SEC, estimateStarts } from "./wait";

const NOW = new Date("2026-10-24T20:30:00.000Z");
const nowIso = NOW.toISOString();

function queuedOf(s: DjSnapshot) {
  return orderedQueue(s, nowIso).filter((i) => i.status === "queued");
}

describe("estimateStarts", () => {
  it("starts the first waiting song after what is left of the one on the mic", () => {
    const s = demoSnapshot(NOW);
    const singing = nowSinging(s)!;
    const first = queuedOf(s)[0]!;
    const starts = estimateStarts(s, nowIso);
    const end = Date.parse(singing.startedAt!) + (singing.durationSec ?? 0) * 1000;
    expect(starts.get(first.requestId)).toBe(Math.max(end, NOW.getTime()) + CHANGEOVER_SEC * 1000);
  });

  it("adds each song ahead plus a changeover, in queue order", () => {
    const s = demoSnapshot(NOW);
    const [a, b] = queuedOf(s);
    const starts = estimateStarts(s, nowIso);
    expect(starts.get(b!.requestId)! - starts.get(a!.requestId)!).toBe(
      ((a!.durationSec ?? DEFAULT_SONG_SEC) + CHANGEOVER_SEC) * 1000,
    );
    const values = queuedOf(s).map((i) => starts.get(i.requestId)!);
    expect([...values].sort((x, y) => x - y)).toEqual(values);
  });

  it("does not estimate pending requests", () => {
    const s = demoSnapshot(NOW);
    const pending = s.items.filter((i) => i.status === "pending");
    const starts = estimateStarts(s, nowIso);
    expect(pending.every((i) => !starts.has(i.requestId))).toBe(true);
  });

  it("uses the default length for songs without one and starts now when nobody sings", () => {
    const base = demoSnapshot(NOW);
    const s: DjSnapshot = {
      ...base,
      items: base.items
        .filter((i) => i.status !== "now_singing")
        .map((i) => ({ ...i, durationSec: null, videos: [] })),
    };
    const [a, b] = queuedOf(s);
    const starts = estimateStarts(s, nowIso);
    expect(starts.get(a!.requestId)).toBe(NOW.getTime());
    expect(starts.get(b!.requestId)).toBe(
      NOW.getTime() + (DEFAULT_SONG_SEC + CHANGEOVER_SEC) * 1000,
    );
  });

  it("is empty when the night is closed", () => {
    const closed = closeNightSnapshot(demoSnapshot(NOW), nowIso);
    expect(estimateStarts(closed, nowIso).size).toBe(0);
  });
});
