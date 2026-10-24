import { cookies, headers } from "next/headers";

/**
 * Guest session: which table a phone has joined, and the name the guest chose.
 *
 * This cookie is unsigned and only drives what the guest *sees* (ADR-008). The identity
 * that authorizes writes is the Supabase anonymous session created by the join action
 * (ADR-009). `guestId` is a random id that survives re-joins; without Supabase configured
 * it also keys the in-memory demo night, so one browser is one demo sandbox.
 */

export const GUEST_COOKIE = "kj_guest";
const GUEST_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface GuestSession {
  v: 2;
  /** Random id minted at first join and kept across re-joins; never an authorization token. */
  guestId: string;
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
  if (s.v !== 2) return null;
  const fields = [
    "guestId",
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
    v: 2,
    guestId: s.guestId as string,
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

/**
 * Whether the cookie should carry the `Secure` attribute.
 *
 * Decided per request, not from NODE_ENV: a production build served over plain http on
 * localhost (`next start` in CI, a laptop demo) must not set `Secure`, because WebKit, unlike
 * Chrome and Firefox, drops Secure cookies on http://localhost. The guest would then look
 * joined on the page returned by the join action and lose the session on the next request.
 * Over https (Vercel and any TLS proxy send `x-forwarded-proto: https`) it is always set, and
 * a production build on a non-local host keeps it even without the header.
 */
export function cookieNeedsSecure(input: {
  forwardedProto: string | null;
  host: string | null;
  nodeEnv: string | undefined;
}): boolean {
  const proto = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  if (proto === "http") return false;
  const hostname = (input.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const local =
    hostname === "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  return input.nodeEnv === "production" && !local;
}

/** Only callable from a Server Action or Route Handler (cookies are read-only elsewhere). */
export async function setGuestSession(session: GuestSession): Promise<void> {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  store.set(GUEST_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieNeedsSecure({
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      host: requestHeaders.get("host"),
      nodeEnv: process.env.NODE_ENV,
    }),
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearGuestSession(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
