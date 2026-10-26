/**
 * Validate a `next` redirect target so the auth callback can only send the user to a same-origin
 * path, never to another site (open redirect). Returns the fallback for anything that is not a
 * plain, same-origin path reference.
 *
 * The old check (`starts with "/"` and not `"//"`) was bypassable: the WHATWG URL parser treats a
 * backslash as a slash and strips tab/newline for http(s), so `"/\\evil.com"` or `"/<TAB>/evil.com"`
 * parsed to `https://evil.com/` (pentest finding L1, 2026-10-26). We now also reject backslashes and
 * control characters, and confirm the value stays same-origin when resolved against a placeholder.
 */
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const PLACEHOLDER_ORIGIN = "https://kj.invalid";

export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  // Must be a single-slash path reference: not protocol-relative ("//"), not "/\" (which the URL
  // parser reads as "//"), and with no control chars or backslashes that could form an authority.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (CONTROL_OR_BACKSLASH.test(value)) return fallback;
  try {
    const resolved = new URL(value, PLACEHOLDER_ORIGIN);
    // If it resolved to anything other than our placeholder origin, it was not a same-origin path.
    if (resolved.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
