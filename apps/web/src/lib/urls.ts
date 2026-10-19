/**
 * URL builders shared by the admin QR sheet, the guest share link and the auth flow.
 * Pure functions: `origin` is passed in so they are unit-testable and work on the server.
 */

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/** URL encoded in a table's printed QR code. */
export function buildJoinUrl(origin: string, locale: string, qrToken: string): string {
  return `${trimOrigin(origin)}/${locale}/join/${encodeURIComponent(qrToken)}`;
}

/** Path (no origin) of the manual code page, optionally prefilled. */
export function joinPath(locale: string, code?: string): string {
  return code ? `/${locale}/join/${encodeURIComponent(code)}` : `/${locale}/join`;
}

/** Invite link guests share to pull friends into an ad hoc group. */
export function buildGroupInviteUrl(origin: string, locale: string, groupId: string): string {
  return `${trimOrigin(origin)}/${locale}/join/group/${encodeURIComponent(groupId)}`;
}

/** Login URL that returns the user to `next` after sign-in. */
export function loginPath(locale: string, next?: string | null): string {
  const base = `/${locale}/login`;
  const safe = safeNext(next ?? null, "");
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

/**
 * Only allow same-origin relative paths as post-login destinations, to prevent
 * open redirects. Anything else falls back.
 */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
