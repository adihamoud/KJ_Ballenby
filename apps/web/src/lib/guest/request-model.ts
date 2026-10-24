// Pure helpers shared by the request sheet (client) and the request actions (server).
// No imports from server-only modules here.

import type { ReasonCode } from "@kj/queue-engine";
import { GUEST_NAME_MAX } from "./join-code";

export const REQUEST_NOTE_MAX = 200;
/** Hard cap on singers accepted from the client; the engine enforces the venue's own limit. */
export const SINGERS_HARD_MAX = 20;

/** Message key under `queue.reject` for each engine reason code (QUEUE_RULES.md section 7). */
export const REJECT_MESSAGE_KEYS = {
  MAX_PENDING_USER: "maxPendingUser",
  MAX_PENDING_TABLE: "maxPendingTable",
  COOLDOWN: "cooldown",
  DUPLICATE_SONG: "duplicateSong",
  NIGHT_CLOSED: "nightClosed",
  CUTOFF: "cutoff",
  TOO_MANY_SINGERS: "tooManySingers",
  DUETS_DISABLED: "duetsDisabled",
  SONG_INACTIVE: "songInactive",
} as const satisfies Record<ReasonCode, string>;

export type RejectMessageKey = `queue.reject.${(typeof REJECT_MESSAGE_KEYS)[ReasonCode]}`;

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === "string" && Object.hasOwn(REJECT_MESSAGE_KEYS, value);
}

/** Full next-intl key for a rejection, e.g. `queue.reject.maxPendingUser`. */
export function rejectMessageKey(reason: ReasonCode): RejectMessageKey {
  return `queue.reject.${REJECT_MESSAGE_KEYS[reason]}`;
}

/**
 * Trim and collapse whitespace in each singer name, drop empty ones and cap the list.
 * The count is deliberately not clamped to the venue's `maxSingersPerSong`: the engine must see
 * the real count so it can answer `TOO_MANY_SINGERS`.
 */
export function normalizeSingers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const name = value.replace(/\s+/g, " ").trim().slice(0, GUEST_NAME_MAX);
    if (name) out.push(name);
    if (out.length >= SINGERS_HARD_MAX) break;
  }
  return out;
}

/** Trim the note and cap it; null when empty. */
export function normalizeNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/\s+/g, " ").trim().slice(0, REQUEST_NOTE_MAX);
  return note || null;
}

/** A song request as the guest who made it sees it. */
export interface GuestRequestView {
  requestId: string;
  songId: string;
  title: string;
  artist: string;
  singers: string[];
  note: string | null;
  status: "pending" | "queued" | "now_singing";
  /** 1-based place among the songs still waiting (null while pending or on the mic). */
  position: number | null;
  /** Songs that play before this one, the current singer included (null while pending). */
  ahead: number | null;
  createdAt: string;
}

export interface GuestQueueView {
  /** `demo` when Supabase is not configured: the night lives in this browser only. */
  mode: "demo" | "live";
  nightId: string | null;
  nightOpen: boolean;
  /** Queued and now-singing songs in the whole night. */
  queueLength: number;
  nowSinging: {
    title: string;
    artist: string;
    singers: string[];
    tableLabel: string | null;
  } | null;
  /** The guest's own unfinished requests, oldest first. */
  mine: GuestRequestView[];
  maxSingersPerSong: number;
  allowDuets: boolean;
  generatedAt: string;
}

export interface CreateRequestInput {
  songId: string;
  singers: string[];
  note?: string | null;
}

export type GuestActionError =
  "noSession" | "noIdentity" | "notParticipant" | "invalidInput" | "unavailable";

export type GuestQueueResponse =
  { ok: true; view: GuestQueueView } | { ok: false; kind: "error"; error: GuestActionError };

export type CreateRequestResponse =
  | { ok: true; view: GuestQueueView; requestId: string }
  | { ok: false; kind: "rejected"; reason: ReasonCode }
  | { ok: false; kind: "error"; error: GuestActionError };
