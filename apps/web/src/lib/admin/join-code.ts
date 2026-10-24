/**
 * Join codes are what a guest types when the QR does not scan, so they avoid characters that
 * look alike on a printed sheet (0/O, 1/I/L). Five characters give ~28M codes per venue; the
 * database still enforces uniqueness per venue and the caller retries on a collision.
 */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 5;

export function generateJoinCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    const index = Math.min(
      JOIN_CODE_ALPHABET.length - 1,
      Math.floor(random() * JOIN_CODE_ALPHABET.length),
    );
    code += JOIN_CODE_ALPHABET[index];
  }
  return code;
}

export const TABLE_LABEL_MAX = 40;

/** Trim and collapse whitespace; null when empty or longer than `TABLE_LABEL_MAX`. */
export function normalizeTableLabel(raw: string | null | undefined): string | null {
  const label = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!label || label.length > TABLE_LABEL_MAX) return null;
  return label;
}
