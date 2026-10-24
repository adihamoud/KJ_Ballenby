import { parseRules } from "@kj/queue-engine";
import type { QueueRulesConfig } from "@kj/queue-engine";

/**
 * The venue settings form submits every `QueueRulesConfig` key as text. This module turns that
 * into a validated config: a field is reported invalid when `parseRules` would have silently
 * replaced its value with the default, so the admin sees the problem instead of a surprise.
 * Pure, so the Server Action and the unit tests share it.
 */

export type RulesField = keyof QueueRulesConfig;

export const RULES_FIELDS: readonly RulesField[] = [
  "fairness",
  "maxPendingPerUser",
  "maxPendingPerTable",
  "cooldownMinutesPerUser",
  "requireHostApproval",
  "allowDuets",
  "maxSingersPerSong",
  "hostPriorityEnabled",
  "duplicateSongWindowMinutes",
  "nightCutoffMinutesBeforeClose",
];

/** Numeric fields where an empty input means "no limit" (stored as null). */
export const NULLABLE_FIELDS: ReadonlySet<RulesField> = new Set([
  "maxPendingPerTable",
  "nightCutoffMinutesBeforeClose",
]);
export const BOOLEAN_FIELDS: ReadonlySet<RulesField> = new Set([
  "requireHostApproval",
  "allowDuets",
  "hostPriorityEnabled",
]);
/** Lower bounds the engine enforces (`parseRules` clamps these to at least 1). */
export const RULES_MIN: Partial<Record<RulesField, number>> = {
  maxPendingPerUser: 1,
  maxSingersPerSong: 1,
};

export type RulesFormResult =
  { ok: true; rules: QueueRulesConfig } | { ok: false; invalid: RulesField[] };

export type FormValues = Record<string, string | null | undefined>;

function readValue(source: FormData | FormValues, key: string): string | null {
  if (source instanceof FormData) {
    const value = source.get(key);
    return typeof value === "string" ? value : null;
  }
  return source[key] ?? null;
}

function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Build the candidate config from form fields, then let `parseRules` validate it. Any key
 * whose parsed value differs from the candidate was invalid (wrong type, negative, below the
 * engine's minimum, unknown fairness). Checkboxes are absent when unchecked.
 */
export function rulesFromForm(source: FormData | FormValues): RulesFormResult {
  const candidate: Record<string, unknown> = {};
  const invalid: RulesField[] = [];

  for (const field of RULES_FIELDS) {
    const raw = readValue(source, field);
    if (BOOLEAN_FIELDS.has(field)) {
      candidate[field] = raw !== null && raw !== "" && raw !== "false" && raw !== "0";
      continue;
    }
    if (field === "fairness") {
      candidate[field] = raw ?? "";
      continue;
    }
    const text = (raw ?? "").trim();
    if (text === "") {
      if (NULLABLE_FIELDS.has(field)) candidate[field] = null;
      else invalid.push(field);
      continue;
    }
    const n = parseInteger(text);
    if (n === null) {
      invalid.push(field);
      continue;
    }
    candidate[field] = n;
  }

  const rules = parseRules(candidate);
  for (const field of RULES_FIELDS) {
    if (invalid.includes(field)) continue;
    if (rules[field] !== candidate[field]) invalid.push(field);
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, rules };
}

/** Form field values for a stored config (the inverse of `rulesFromForm`). */
export function rulesToFormValues(rules: QueueRulesConfig): Record<RulesField, string> {
  const out = {} as Record<RulesField, string>;
  for (const field of RULES_FIELDS) {
    const value = rules[field];
    out[field] =
      value === null ? "" : typeof value === "boolean" ? (value ? "on" : "") : String(value);
  }
  return out;
}

export const VENUE_NAME_MAX = 80;

/** Trim and collapse whitespace; null when empty or longer than `VENUE_NAME_MAX`. */
export function normalizeVenueName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > VENUE_NAME_MAX) return null;
  return name;
}
