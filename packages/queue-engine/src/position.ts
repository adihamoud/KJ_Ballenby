/** Spacing between positions when the queue is renumbered. */
export const POSITION_STEP = 1000;

/**
 * Return a position strictly between `prev` and `next`.
 * Pass `undefined` for `prev` to insert at the head, for `next` to append at the tail.
 */
export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return POSITION_STEP;
  if (prev === undefined) return (next as number) - POSITION_STEP;
  if (next === undefined) return prev + POSITION_STEP;
  if (next <= prev) {
    throw new Error(`positionBetween: next (${next}) must be greater than prev (${prev})`);
  }
  return prev + (next - prev) / 2;
}

/** Position for appending after the current last entry. */
export function tailPosition(positions: readonly number[]): number {
  if (positions.length === 0) return POSITION_STEP;
  return Math.max(...positions) + POSITION_STEP;
}
