export const MINUTE_MS = 60_000;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO timestamp: ${iso}`);
  return ms;
}

export function minutesToMs(minutes: number): number {
  return minutes * MINUTE_MS;
}
