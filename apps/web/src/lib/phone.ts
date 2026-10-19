/**
 * Israeli mobile number handling.
 *
 * Accepts the ways people actually type a number (050-123-4567, 0501234567,
 * +972501234567, 972 50 123 4567) and returns E.164 (+9725XXXXXXXX) or null.
 * Only mobile prefixes (05X) are accepted because SMS one-time codes need a mobile.
 */
export function normalizeIsraeliMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;

  let national: string;
  if (digits.startsWith("972")) {
    national = digits.slice(3);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  // National mobile numbers are 9 digits starting with 5.
  if (!/^5\d{8}$/.test(national)) return null;
  return `+972${national}`;
}

/** Format E.164 back to the familiar local form for display: 050-123-4567. */
export function formatIsraeliMobile(e164: string): string {
  const match = /^\+972(5\d)(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]}-${match[2]}-${match[3]}`;
}
