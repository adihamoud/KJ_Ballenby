import type { QueueRulesConfig } from "./types";

export const DEFAULT_RULES: QueueRulesConfig = {
  fairness: "round_robin_table",
  maxPendingPerUser: 1,
  maxPendingPerTable: null,
  cooldownMinutesPerUser: 0,
  requireHostApproval: false,
  allowDuets: true,
  maxSingersPerSong: 4,
  hostPriorityEnabled: true,
  duplicateSongWindowMinutes: 60,
  nightCutoffMinutesBeforeClose: null,
};

const FAIRNESS_VALUES: ReadonlySet<string> = new Set([
  "fifo",
  "round_robin_table",
  "round_robin_singer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function nullableNonNegativeInt(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Parse a venue's stored rules config (jsonb) into a complete, valid config.
 * Unknown keys are dropped, missing or invalid values fall back to defaults.
 * Never throws.
 */
export function parseRules(input: unknown): QueueRulesConfig {
  if (!isRecord(input)) return { ...DEFAULT_RULES };
  const d = DEFAULT_RULES;
  const fairness =
    typeof input.fairness === "string" && FAIRNESS_VALUES.has(input.fairness)
      ? (input.fairness as QueueRulesConfig["fairness"])
      : d.fairness;
  return {
    fairness,
    maxPendingPerUser: Math.max(1, nonNegativeInt(input.maxPendingPerUser, d.maxPendingPerUser)),
    maxPendingPerTable: nullableNonNegativeInt(input.maxPendingPerTable, d.maxPendingPerTable),
    cooldownMinutesPerUser: nonNegativeInt(input.cooldownMinutesPerUser, d.cooldownMinutesPerUser),
    requireHostApproval: bool(input.requireHostApproval, d.requireHostApproval),
    allowDuets: bool(input.allowDuets, d.allowDuets),
    maxSingersPerSong: Math.max(1, nonNegativeInt(input.maxSingersPerSong, d.maxSingersPerSong)),
    hostPriorityEnabled: bool(input.hostPriorityEnabled, d.hostPriorityEnabled),
    duplicateSongWindowMinutes: nonNegativeInt(
      input.duplicateSongWindowMinutes,
      d.duplicateSongWindowMinutes,
    ),
    nightCutoffMinutesBeforeClose: nullableNonNegativeInt(
      input.nightCutoffMinutesBeforeClose,
      d.nightCutoffMinutesBeforeClose,
    ),
  };
}
