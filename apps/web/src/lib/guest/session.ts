import { cookies } from "next/headers";

/**
 * Guest session: which table a phone has joined, and the name the guest chose.
 *
 * Guests join without signing in (auth lands last in phase 1), so this lives in an
 * HttpOnly cookie rather than in Supabase Auth. It only drives what the guest *sees*;
 * nothing is written to the database on its behalf yet. When song requests land, the
 * guest identity moves to a server-verifiable token (see ADR-008).
 */

export const GUEST_COOKIE = "kj_guest";
const GUEST_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface GuestSession {
  v: 1;
  tableId: string;
  tableLabel: string;
  joinCode: string;
  venueId: string;
  venueName: string;
  venueSlug: string;
  name: string;
  joinedAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Parse the raw cookie value; null for anything malformed or from an older format. */
export function parseGuestSession(raw: string | undefined | null): GuestSession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const s = parsed as Record<string, unknown>;
  if (s.v !== 1) return null;
  const fields = [
    "tableId",
    "tableLabel",
    "joinCode",
    "venueId",
    "venueName",
    "venueSlug",
    "name",
    "joinedAt",
  ] as const;
  for (const key of fields) {
    if (!isNonEmptyString(s[key])) return null;
  }
  return {
    v: 1,
    tableId: s.tableId as string,
    tableLabel: s.tableLabel as string,
    joinCode: s.joinCode as string,
    venueId: s.venueId as string,
    venueName: s.venueName as string,
    venueSlug: s.venueSlug as string,
    name: s.name as string,
    joinedAt: s.joinedAt as string,
  };
}

export async function getGuestSession(): Promise<GuestSession | null> {
  const store = await cookies();
  return parseGuestSession(store.get(GUEST_COOKIE)?.value);
}

/** Only callable from a Server Action or Route Handler (cookies are read-only elsewhere). */
export async function setGuestSession(session: GuestSession): Promise<void> {
  const store = await cookies();
  store.set(GUEST_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearGuestSession(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
