const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_CODE_RE = /^[A-Z0-9]{4,8}$/;

export const GUEST_NAME_MAX = 40;

/**
 * Normalize what a guest typed (or what a QR encoded) into something `resolve_table` accepts:
 * a lowercase uuid `qr_token`, or an uppercase `join_code` of 4-8 letters and digits.
 * Spaces and dashes inside a short code are ignored ("de mo-1" -> "DEMO1").
 * Returns null when the input cannot be a valid code.
 */
export function normalizeJoinCode(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();
  const compact = trimmed.replace(/[\s-]+/g, "").toUpperCase();
  return JOIN_CODE_RE.test(compact) ? compact : null;
}

/** Trim and collapse whitespace; null when empty or longer than `GUEST_NAME_MAX`. */
export function normalizeGuestName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > GUEST_NAME_MAX) return null;
  return name;
}
