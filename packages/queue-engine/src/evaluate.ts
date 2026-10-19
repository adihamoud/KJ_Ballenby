import type { EvaluateResult, NewRequest, NightState, QueueRulesConfig } from "./types";
import { minutesToMs, toMs } from "./time";
import { tailPosition } from "./position";

/**
 * Decide whether a new request may enter the night, and with which status.
 *
 * Checks run in a fixed order so the most fundamental rejection wins:
 * night state -> song validity -> singers -> quotas -> timing rules.
 */
export function evaluateRequest(
  rules: QueueRulesConfig,
  state: NightState,
  req: NewRequest,
): EvaluateResult {
  const now = toMs(state.now);

  if (state.nightStatus !== "open") {
    return { ok: false, reason: "NIGHT_CLOSED" };
  }

  if (rules.nightCutoffMinutesBeforeClose !== null && state.closesAt) {
    const cutoffAt = toMs(state.closesAt) - minutesToMs(rules.nightCutoffMinutesBeforeClose);
    if (now >= cutoffAt) return { ok: false, reason: "CUTOFF" };
  }

  if (!req.songActive) {
    return { ok: false, reason: "SONG_INACTIVE" };
  }

  const singerCount = Math.max(1, req.singers.length);
  if (singerCount > 1 && !rules.allowDuets) {
    return { ok: false, reason: "DUETS_DISABLED" };
  }
  if (singerCount > rules.maxSingersPerSong) {
    return { ok: false, reason: "TOO_MANY_SINGERS" };
  }

  const openForUser =
    state.queue.filter((e) => e.userId === req.userId).length +
    state.pendingRequests.filter((p) => p.userId === req.userId).length;
  if (openForUser >= rules.maxPendingPerUser) {
    return { ok: false, reason: "MAX_PENDING_USER" };
  }

  if (rules.maxPendingPerTable !== null && req.tableId !== null) {
    const openForTable =
      state.queue.filter((e) => e.tableId === req.tableId).length +
      state.pendingRequests.filter((p) => p.tableId === req.tableId).length;
    if (openForTable >= rules.maxPendingPerTable) {
      return { ok: false, reason: "MAX_PENDING_TABLE" };
    }
  }

  if (rules.cooldownMinutesPerUser > 0) {
    const lastEnded = latestEndedAt(state, (h) => h.userId === req.userId);
    if (lastEnded !== null) {
      const eligibleAt = lastEnded + minutesToMs(rules.cooldownMinutesPerUser);
      if (now < eligibleAt) {
        return { ok: false, reason: "COOLDOWN", retryAfterMs: eligibleAt - now };
      }
    }
  }

  if (rules.duplicateSongWindowMinutes > 0) {
    const inQueue =
      state.queue.some((e) => e.songId === req.songId) ||
      state.pendingRequests.some((p) => p.songId === req.songId);
    if (inQueue) return { ok: false, reason: "DUPLICATE_SONG" };

    const lastSung = latestEndedAt(state, (h) => h.songId === req.songId);
    if (lastSung !== null) {
      const allowedAt = lastSung + minutesToMs(rules.duplicateSongWindowMinutes);
      if (now < allowedAt) {
        return { ok: false, reason: "DUPLICATE_SONG", retryAfterMs: allowedAt - now };
      }
    }
  }

  return {
    ok: true,
    status: rules.requireHostApproval ? "pending" : "queued",
    position: tailPosition(state.queue.map((e) => e.position)),
  };
}

function latestEndedAt(
  state: NightState,
  predicate: (h: NightState["history"][number]) => boolean,
): number | null {
  let latest: number | null = null;
  for (const h of state.history) {
    if (!predicate(h)) continue;
    const t = toMs(h.endedAt);
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}
