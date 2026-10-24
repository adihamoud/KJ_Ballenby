import type { NightState, PositionChange, QueueEntry, QueueRulesConfig } from "./types";
import { toMs } from "./time";
import { POSITION_STEP } from "./position";

/**
 * Compute the fair order of the queue.
 *
 * Invariants, in priority order:
 *  1. Entries that are `now_singing` are always first.
 *  2. Entries the host locked keep their current index (relative to the position-sorted queue).
 *  3. Remaining entries are ordered by the fairness strategy:
 *     - fifo: by priority (if enabled) desc, then createdAt asc.
 *     - round_robin_*: entries are grouped by table (or singer). Within a group FIFO applies.
 *       Groups take turns; the group whose most recent performance is oldest goes first.
 *       Within a round, higher priority (if enabled) moves earlier.
 */
export function computeOrder(rules: QueueRulesConfig, state: NightState): QueueEntry[] {
  const sorted = [...state.queue].sort(byPosition);
  const singing = sorted.filter((e) => e.status === "now_singing");
  const rest = sorted.filter((e) => e.status !== "now_singing");

  const lockedAtIndex = new Map<number, QueueEntry>();
  const free: QueueEntry[] = [];
  rest.forEach((entry, index) => {
    if (entry.lockedByHost) lockedAtIndex.set(index, entry);
    else free.push(entry);
  });

  const ordered =
    rules.fairness === "fifo" ? orderFifo(rules, free) : orderRoundRobin(rules, state, free);

  // Re-insert locked entries at their original indices.
  const result: QueueEntry[] = [];
  let freeIdx = 0;
  for (let i = 0; i < rest.length; i++) {
    const locked = lockedAtIndex.get(i);
    if (locked) {
      result.push(locked);
    } else {
      const next = ordered[freeIdx++];
      if (next) result.push(next);
    }
  }

  return [...singing, ...result];
}

/**
 * Produce the set of position updates that make the stored positions match
 * `computeOrder`. Returns an empty array when the queue is already in order;
 * otherwise the queue is renumbered with POSITION_STEP spacing and only entries
 * whose position actually changes are returned.
 */
export function reorder(rules: QueueRulesConfig, state: NightState): PositionChange[] {
  const target = computeOrder(rules, state);
  const current = [...state.queue].sort(byPosition);

  const sameOrder =
    target.length === current.length && target.every((e, i) => e.id === current[i]?.id);
  if (sameOrder) return [];

  const changes: PositionChange[] = [];
  target.forEach((entry, index) => {
    const position = (index + 1) * POSITION_STEP;
    if (entry.position !== position) changes.push({ id: entry.id, position });
  });
  return changes;
}

function byPosition(a: QueueEntry, b: QueueEntry): number {
  if (a.position !== b.position) return a.position - b.position;
  return toMs(a.createdAt) - toMs(b.createdAt);
}

function byPriorityThenCreated(rules: QueueRulesConfig) {
  return (a: QueueEntry, b: QueueEntry): number => {
    if (rules.hostPriorityEnabled && a.priority !== b.priority) return b.priority - a.priority;
    return toMs(a.createdAt) - toMs(b.createdAt);
  };
}

function orderFifo(rules: QueueRulesConfig, entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(byPriorityThenCreated(rules));
}

function groupKey(rules: QueueRulesConfig, e: { tableId: string | null; userId: string }): string {
  if (rules.fairness === "round_robin_table" && e.tableId !== null) return `table:${e.tableId}`;
  return `user:${e.userId}`;
}

function orderRoundRobin(
  rules: QueueRulesConfig,
  state: NightState,
  entries: QueueEntry[],
): QueueEntry[] {
  const cmp = byPriorityThenCreated(rules);

  // Group entries, FIFO (with priority) within each group.
  const groups = new Map<string, QueueEntry[]>();
  for (const e of [...entries].sort(cmp)) {
    const key = groupKey(rules, e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  // Most recent performance per group, from history and whoever is singing now.
  const lastPerformed = new Map<string, number>();
  for (const h of state.history) {
    const key = groupKey(rules, h);
    const t = toMs(h.endedAt);
    const prev = lastPerformed.get(key);
    if (prev === undefined || t > prev) lastPerformed.set(key, t);
  }
  const nowMs = toMs(state.now);
  for (const e of state.queue) {
    if (e.status === "now_singing") lastPerformed.set(groupKey(rules, e), nowMs);
  }

  const firstCreated = (key: string): number => {
    const first = groups.get(key)?.[0];
    return first ? toMs(first.createdAt) : Number.MAX_SAFE_INTEGER;
  };

  // Group order: never-performed groups first (by earliest request), then oldest performance first.
  const keys = [...groups.keys()].sort((a, b) => {
    const la = lastPerformed.get(a);
    const lb = lastPerformed.get(b);
    if (la === undefined && lb !== undefined) return -1;
    if (la !== undefined && lb === undefined) return 1;
    if (la !== undefined && lb !== undefined && la !== lb) return la - lb;
    return firstCreated(a) - firstCreated(b);
  });

  // Interleave rounds: one entry per group per round.
  const result: QueueEntry[] = [];
  let round = 0;
  while (result.length < entries.length) {
    const thisRound: QueueEntry[] = [];
    for (const key of keys) {
      const e = groups.get(key)?.[round];
      if (e) thisRound.push(e);
    }
    if (thisRound.length === 0) break;
    if (rules.hostPriorityEnabled) {
      // Array.prototype.sort is stable, so equal priorities keep the group order.
      thisRound.sort((a, b) => b.priority - a.priority);
    }
    result.push(...thisRound);
    round++;
  }
  return result;
}
