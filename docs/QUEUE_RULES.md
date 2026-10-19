# Queue Rules Engine Specification

Package: `packages/queue-engine` (`@kj/queue-engine`). Pure TypeScript, no I/O, no database dependency, fully unit-tested with Vitest. The same code runs in Next.js Server Actions (phase 2) and in the VirtualDJ bridge (phase 4).

## 1. Purpose

Given a venue's rules configuration, the current state of the night, and a candidate request, decide:

1. whether the request is **accepted** or **rejected** (with a machine-readable reason code), and
2. if accepted, **where** it enters the queue (a fractional `position`) and with which initial `status`.

Separately, `reorder(state)` recomputes the fair order of the whole queue (used after a song finishes, after approval, or after rules change), always respecting host locks.

The engine is deterministic: same inputs, same outputs. It never reads the clock; `now` is passed in.

## 2. Inputs and outputs

```ts
// Config stored in queue_rules.config and copied to nights.rules_snapshot
export interface RulesConfig {
  fairness: "fifo" | "round_robin_table" | "round_robin_singer"; // default 'round_robin_table'
  maxPendingPerUser: number; // default 1
  maxPendingPerTable: number | null; // default null (unlimited)
  cooldownMinutesPerUser: number; // default 0
  requireHostApproval: boolean; // default false
  allowDuets: boolean; // default true
  maxSingersPerSong: number; // default 4
  hostPriorityEnabled: boolean; // default true
  duplicateSongWindowMinutes: number; // default 60
  nightCutoffMinutesBeforeClose: number | null; // default null
}

export interface QueueEntryState {
  entryId: string;
  requestId: string;
  songId: string;
  requestedBy: string; // user id
  tableId: string | null;
  groupId: string | null;
  singers: string[]; // display names
  status: "approved" | "queued" | "now_singing";
  priority: number;
  position: number; // fractional rank
  lockedByHost: boolean;
  createdAt: Date;
  startedAt: Date | null;
}

export interface HistoryItem {
  requestId: string;
  songId: string;
  requestedBy: string;
  tableId: string | null;
  status: "done" | "skipped" | "now_singing";
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface NightState {
  nightId: string;
  status: "open" | "closed";
  startedAt: Date;
  plannedCloseAt: Date | null; // from venue settings; null = no cutoff
  entries: QueueEntryState[]; // active queue (approved/queued/now_singing)
  pending: Array<
    Pick<QueueEntryState, "requestId" | "requestedBy" | "tableId" | "songId" | "createdAt">
  >; // awaiting approval
  history: HistoryItem[]; // done/skipped/now_singing this night, most recent first
}

export interface CandidateRequest {
  songId: string;
  songIsActive: boolean;
  requestedBy: string;
  tableId: string | null;
  groupId: string | null;
  singers: string[];
  priority?: number; // host-created requests only
  isHost: boolean; // true when a dj/admin/owner submits on behalf of a guest
}

export type ReasonCode =
  | "MAX_PENDING_USER"
  | "MAX_PENDING_TABLE"
  | "COOLDOWN"
  | "DUPLICATE_SONG"
  | "NIGHT_CLOSED"
  | "CUTOFF"
  | "TOO_MANY_SINGERS"
  | "DUETS_DISABLED"
  | "SONG_INACTIVE";

export type EvaluateResult =
  | { ok: false; reason: ReasonCode; details?: Record<string, unknown> }
  | { ok: true; status: "pending" | "queued"; position: number | null };
// position is null when status is 'pending' (not in queue yet)

export function evaluateRequest(
  rules: RulesConfig,
  state: NightState,
  candidate: CandidateRequest,
  now: Date,
): EvaluateResult;

export interface ReorderResult {
  positions: Array<{ entryId: string; position: number }>; // only entries whose position changed
  order: string[]; // all entryIds in final order
}

export function reorder(rules: RulesConfig, state: NightState, now: Date): ReorderResult;

export const defaultRules: RulesConfig;
export const rulesConfigSchema: ZodType<RulesConfig>; // validates and fills defaults
```

The caller (Server Action) is responsible for loading state, running the function, and persisting the result inside a transaction. The engine never mutates its inputs.

## 3. Evaluation order

`evaluateRequest` checks rules in this fixed order and returns the first failure:

1. `NIGHT_CLOSED` - `state.status !== 'open'`.
2. `CUTOFF` - `nightCutoffMinutesBeforeClose` set, `plannedCloseAt` known, and `now >= plannedCloseAt - cutoff`.
3. `SONG_INACTIVE` - `candidate.songIsActive === false`.
4. `DUETS_DISABLED` - `!allowDuets && singers.length > 1`.
5. `TOO_MANY_SINGERS` - `singers.length > maxSingersPerSong` (also rejects `singers.length === 0`; the UI always sends at least the requester).
6. `MAX_PENDING_USER` - count of entries + pending where `requestedBy === candidate.requestedBy` is `>= maxPendingPerUser`.
7. `MAX_PENDING_TABLE` - when set and `candidate.tableId` not null, count of entries + pending for that table is `>= maxPendingPerTable`.
8. `COOLDOWN` - most recent history item with `status === 'done'` for the user has `endedAt + cooldownMinutesPerUser > now`.
9. `DUPLICATE_SONG` - a history item or active entry for the same `songId` exists with `createdAt`/`endedAt` within the last `duplicateSongWindowMinutes`.

Host-submitted candidates (`isHost: true`) skip checks 6-9 (host overrides always win) but still fail 1, 3, 4, 5.

If all pass:

- `requireHostApproval && !isHost` -> `{ ok: true, status: 'pending', position: null }`.
- otherwise -> `{ ok: true, status: 'queued', position }` where `position` is computed by running the fairness algorithm with the candidate included and placing it between its computed neighbours (see 5.3).

## 4. Rules

Each rule is configured in `RulesConfig`. "Toggle off" means setting the neutral value shown.

| Rule                  | Key                             | Default             | Off value    | Behaviour                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------- | ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fairness              | `fairness`                      | `round_robin_table` | `fifo`       | `fifo`: strict arrival order. `round_robin_table`: cycle through tables so consecutive songs come from different tables; the table that sang most recently goes last. `round_robin_singer`: same, keyed by requesting user. Entries with no table (ad hoc group) use `groupId`, falling back to `requestedBy`, as their key. |
| Max pending per user  | `maxPendingPerUser`             | 1                   | large number | A user may not have more than N requests that are not yet `done/skipped/cancelled` (counts `pending`, `approved`, `queued`, `now_singing`).                                                                                                                                                                                  |
| Max pending per table | `maxPendingPerTable`            | null                | null         | Same, per table.                                                                                                                                                                                                                                                                                                             |
| Cooldown              | `cooldownMinutesPerUser`        | 0                   | 0            | After a user's song is `done`, their next request is rejected until N minutes have passed.                                                                                                                                                                                                                                   |
| Host approval         | `requireHostApproval`           | false               | false        | Requests enter as `pending`; the DJ approves (-> `queued`, position assigned by the engine) or skips.                                                                                                                                                                                                                        |
| Duets                 | `allowDuets`                    | true                | true         | When false, `singers` must have exactly one name.                                                                                                                                                                                                                                                                            |
| Max singers           | `maxSingersPerSong`             | 4                   | 4            | Upper bound on `singers.length`.                                                                                                                                                                                                                                                                                             |
| Host priority         | `hostPriorityEnabled`           | true                | false        | When true, `priority` (int, default 0) influences order: higher first **within the fairness constraints** (see 5.2). When false, `priority` is ignored by `reorder()` even if set.                                                                                                                                           |
| Duplicate song window | `duplicateSongWindowMinutes`    | 60                  | 0            | The same `songId` cannot be queued again within N minutes of its last request being queued or finished.                                                                                                                                                                                                                      |
| Night cutoff          | `nightCutoffMinutesBeforeClose` | null                | null         | No new guest requests in the last N minutes before the venue's planned close time.                                                                                                                                                                                                                                           |

Changing rules while a night is open does not rewrite history; the Server Action calls `reorder()` with the new config so the active queue reflects the change.

## 5. Ordering algorithm

### 5.1 Keys and history

- **Fairness key** of an entry: `tableId` (round_robin_table), `requestedBy` (round_robin_singer), or none (fifo).
- **lastSungAt(key)**: the latest `startedAt` (or `endedAt`) among `history` items and `now_singing` entries with that key; `null` if the key has not sung tonight. Skipped songs do not count as sung.

### 5.2 `reorder()`

1. Partition `entries` into **locked** (`lockedByHost` or `status === 'now_singing'`) and **free**. Locked entries keep their current `position` and are never moved.
2. If `fairness === 'fifo'`: sort free entries by `priority desc` (if `hostPriorityEnabled`), then `createdAt asc`.
3. Otherwise (round robin):
   a. Group free entries by key. Within each key, sort by `priority desc` (if enabled), then `createdAt asc`. This is the key's FIFO lane.
   b. Initialize `virtualLast[key] = lastSungAt(key)`.
   c. Repeat until all lanes are empty: among keys with a non-empty lane, pick the key with the **oldest** `virtualLast` (`null` counts as oldest). Ties: higher head `priority` first (if enabled), then earlier head `createdAt`, then key id for determinism. Emit the head of that lane and set `virtualLast[key] = tick++` (a monotonically increasing synthetic timestamp later than any real one), so the key goes to the back of the rotation.
4. Merge: walk the final sequence of free entries into the gaps between locked entries in position order. Locked entries act as fixed anchors; free entries that were before an anchor stay before it only if the anchor is `now_singing`; for host-pinned anchors the free sequence fills the slots around them in order (anchor positions are preserved, free entries receive fractional positions between anchors).
5. Assign positions: for each gap between anchors `a` and `b` (or `0` / `last+1` at the ends), spread the entries evenly as `a + (b - a) * i / (n + 1)`. When fractional positions get too dense (difference < 1e-6), renumber the whole night as integers (this is the only time renumbering happens).
6. Return only entries whose position changed.

Priority therefore lets the host bump a request to the front of **its own table's lane** and win ties between tables; it does not let one table take two consecutive turns while another table is waiting.

### 5.3 Insertion position for a new request

`evaluateRequest` runs step 3 above with the candidate appended as a synthetic free entry (key, `priority`, `createdAt = now`). It finds the candidate's neighbours in the resulting order and returns `(prevPosition + nextPosition) / 2`, or `lastPosition + 1` if it lands at the end, or `firstPosition / 2` if it lands at the front (never before a `now_singing` entry). Existing entries are **not** moved by an insertion; the full `reorder()` runs when a song finishes.

## 6. Worked example: 3 tables, 6 requests, `round_robin_table`

Rules: defaults (`round_robin_table`, `maxPendingPerUser: 1`, `hostPriorityEnabled: true`). All requests accepted; no locks.

Arrivals (one request per user, so `maxPendingPerUser` never trips):

| #   | Time  | Table | Requester | Song   |
| --- | ----- | ----- | --------- | ------ |
| R1  | 20:00 | T1    | Dana      | Song A |
| R2  | 20:01 | T1    | Yossi     | Song B |
| R3  | 20:02 | T2    | Noa       | Song C |
| R4  | 20:03 | T1    | Avi       | Song D |
| R5  | 20:04 | T3    | Lior      | Song E |
| R6  | 20:05 | T2    | Maya      | Song F |

**FIFO would give:** R1, R2, R3, R4, R5, R6 (T1 sings three of the first four songs).

**Case A - nobody has sung yet** (`lastSungAt` is `null` for all tables).

Lanes: T1 = [R1, R2, R4], T2 = [R3, R6], T3 = [R5].

| Pick | Eligible keys (virtualLast)        | Chosen   | Why                                                       |
| ---- | ---------------------------------- | -------- | --------------------------------------------------------- |
| 1    | T1 (null), T2 (null), T3 (null)    | T1 -> R1 | All null; tie-break earliest head createdAt (20:00)       |
| 2    | T1 (tick1), T2 (null), T3 (null)   | T2 -> R3 | null beats tick; T2 head 20:02 earlier than T3 head 20:04 |
| 3    | T1 (tick1), T2 (tick2), T3 (null)  | T3 -> R5 | Only null left                                            |
| 4    | T1 (tick1), T2 (tick2), T3 (tick3) | T1 -> R2 | Oldest tick                                               |
| 5    | T1 (tick4), T2 (tick2)             | T2 -> R6 | T3 lane empty; T2 oldest                                  |
| 6    | T1 (tick4)                         | T1 -> R4 | Last remaining                                            |

Result: **R1, R3, R5, R2, R6, R4** with positions 1, 2, 3, 4, 5, 6.

**Case B - with history.** Suppose before 20:00 T1 finished a song at 19:58 and T3 at 19:50; T2 has not sung.

`lastSungAt`: T1 = 19:58, T2 = null, T3 = 19:50.

Round 1 order of tables: T2 (null) -> R3, T3 (19:50) -> R5, T1 (19:58) -> R1. Round 2: T2 -> R6, T1 -> R2 (T3 empty). Round 3: T1 -> R4.

Result: **R3, R5, R1, R6, R2, R4**.

**Insertion.** In case A, at 20:06 Tom from T3 requests Song G (R7). Running the algorithm with R7 added yields R1, R3, R5, R2, R6, **R7**, R4 (T3's turn comes before T1's third song). R7 is inserted between R6 (position 5) and R4 (position 6): `position = 5.5`. No other entry moves.

**Priority.** If the host sets `priority = 10` on R4 (T1's third request), T1's lane becomes [R4, R1, R2]; case A result becomes R4, R3, R5, R1, R6, R2. R4 jumps to the front of T1's lane but T2 and T3 still get their turns in between.

**Duplicate rejection.** At 20:30 someone requests Song A again. Song A (R1) was queued at 20:00, within the 60-minute window -> `{ ok: false, reason: 'DUPLICATE_SONG', details: { lastRequestedAt: '20:00' } }`.

## 7. Reason codes

| Code                | Meaning                                                                 | UI message (he / en key)       |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| `MAX_PENDING_USER`  | User already has `maxPendingPerUser` unfinished requests                | `queue.reject.maxPendingUser`  |
| `MAX_PENDING_TABLE` | Table already has `maxPendingPerTable` unfinished requests              | `queue.reject.maxPendingTable` |
| `COOLDOWN`          | User sang less than `cooldownMinutesPerUser` ago; `details.availableAt` | `queue.reject.cooldown`        |
| `DUPLICATE_SONG`    | Same song queued/sung within `duplicateSongWindowMinutes`               | `queue.reject.duplicateSong`   |
| `NIGHT_CLOSED`      | No open night for this venue                                            | `queue.reject.nightClosed`     |
| `CUTOFF`            | Inside the last `nightCutoffMinutesBeforeClose` minutes                 | `queue.reject.cutoff`          |
| `TOO_MANY_SINGERS`  | `singers.length > maxSingersPerSong` or empty                           | `queue.reject.tooManySingers`  |
| `DUETS_DISABLED`    | More than one singer while `allowDuets` is false                        | `queue.reject.duetsDisabled`   |
| `SONG_INACTIVE`     | Song is not active in the venue catalog                                 | `queue.reject.songInactive`    |

Codes are stable identifiers: clients localize them, servers log them, stats count them.

## 8. Host override semantics

Host actions bypass the guest-facing rules; the engine supports them as follows.

| Action            | Effect on data                                                         | Effect on engine                                                                                                           |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Approve           | `pending -> queued`; engine computes insertion position as in 5.3      | Normal fairness placement                                                                                                  |
| Pin / lock        | `queue_entries.locked_by_host = true`                                  | Entry is an anchor: `reorder()` never moves it; free entries flow around it                                                |
| Unpin             | `locked_by_host = false`                                               | Entry rejoins the fair ordering on next `reorder()`                                                                        |
| Drag-reorder      | Server sets `position = (prev + next) / 2` and `locked_by_host = true` | Treated as pin at the new spot; otherwise the next `reorder()` would undo the drag                                         |
| Set priority      | `song_requests.priority = n`                                           | Affects order within the entry's lane and tie-breaks (only if `hostPriorityEnabled`)                                       |
| Start             | `status = now_singing`, `started_at = now`                             | Entry becomes an anchor at the head; its key's `lastSungAt` updates, pushing that table/singer to the back of the rotation |
| Done              | `status = done`, `ended_at = now`                                      | Removed from entries, added to history; cooldown and duplicate window start from `ended_at`; `reorder()` runs              |
| Skip              | `status = skipped`, `ended_at = now`                                   | Removed from entries; does **not** count as sung (no cooldown, no `lastSungAt` update)                                     |
| Host adds request | `isHost: true` candidate                                               | Skips `MAX_PENDING_*`, `COOLDOWN`, `DUPLICATE_SONG`; may set `priority`                                                    |
| Close night       | `nights.status = closed`                                               | All further `evaluateRequest` calls return `NIGHT_CLOSED`                                                                  |

Invariant: after any host action, the server calls `reorder()` and persists the result; locked and `now_singing` entries are never moved by that call.

## 9. Testing requirements

- One unit test per reason code, including boundary values (exactly N pending, exactly N minutes).
- Fairness tests for the worked example above (cases A and B, insertion, priority), for `fifo`, and for `round_robin_singer`.
- Property test: `reorder()` is idempotent (`reorder(reorder(s)) == reorder(s)`) and never changes locked positions.
- Determinism test: same inputs produce identical output across runs.
- Host-path tests: `isHost` bypasses only the intended checks.
