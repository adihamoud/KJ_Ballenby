/**
 * Table join codes.
 *
 * Codes are generated server-side from an alphabet without ambiguous characters
 * (no 0/O, 1/I) but guests type them from a printed card, so we accept any
 * letters/digits, strip spaces and dashes and uppercase. The database compares
 * the normalized form.
 */
export const JOIN_CODE_MIN_LENGTH = 4;
export const JOIN_CODE_MAX_LENGTH = 6;
export const JOIN_CODE_LENGTH = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uppercase, keep only letters and digits. Does not validate length. */
export function normalizeJoinCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** True when the normalized code has an acceptable length. */
export function isValidJoinCode(normalized: string): boolean {
  return (
    normalized.length >= JOIN_CODE_MIN_LENGTH &&
    normalized.length <= JOIN_CODE_MAX_LENGTH &&
    /^[A-Z0-9]+$/.test(normalized)
  );
}

/** A QR token is a uuid. Everything else is treated as a typed join code. */
export function isQrToken(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Normalize whatever arrived in the URL (scanned token or typed code) into the
 * value sent to the `resolve_table` / `join_table` RPCs, or null if it cannot be one.
 */
export function parseJoinCodeParam(raw: string): string | null {
  const value = raw.trim();
  if (isQrToken(value)) return value.toLowerCase();
  const code = normalizeJoinCode(value);
  return isValidJoinCode(code) ? code : null;
}
