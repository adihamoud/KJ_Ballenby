import type { NightState, QueueEntry } from "./types";

/** Base time used by tests: 2026-10-19 21:00 Israel time (UTC+3). */
export const T0 = Date.parse("2026-10-19T18:00:00.000Z");

export function at(minutesFromT0: number): string {
  return new Date(T0 + minutesFromT0 * 60_000).toISOString();
}

let counter = 0;

export function entry(
  overrides: Partial<QueueEntry> & Pick<QueueEntry, "userId"> & { minute?: number },
): QueueEntry {
  counter += 1;
  const { minute = counter, ...rest } = overrides;
  return {
    id: `e${counter}`,
    requestId: `r${counter}`,
    songId: `song-${counter}`,
    tableId: null,
    groupId: null,
    singers: [overrides.userId],
    priority: 0,
    position: counter * 1000,
    lockedByHost: false,
    status: "queued",
    createdAt: at(minute),
    ...rest,
  };
}

export function night(overrides: Partial<NightState> = {}): NightState {
  return {
    now: at(60),
    nightStatus: "open",
    closesAt: null,
    queue: [],
    history: [],
    pendingRequests: [],
    ...overrides,
  };
}

export function resetFixtures(): void {
  counter = 0;
}
