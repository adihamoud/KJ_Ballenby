# Architecture Decision Records

Format: context, decision, consequences. Status is `accepted` unless noted. New decisions get the next number; superseded ADRs are kept and marked.

| ADR                                                            | Title                                      | Date       |
| -------------------------------------------------------------- | ------------------------------------------ | ---------- |
| [ADR-001](#adr-001-monorepo-with-pnpm-and-turborepo)           | Monorepo with pnpm and Turborepo           | 2026-10-19 |
| [ADR-002](#adr-002-supabase-over-firebase-or-a-custom-backend) | Supabase over Firebase or a custom backend | 2026-10-19 |
| [ADR-003](#adr-003-queue-engine-as-a-pure-package)             | Queue engine as a pure package             | 2026-10-19 |
| [ADR-004](#adr-004-phase-1-manual-virtualdj-handoff)           | Phase-1 manual VirtualDJ handoff           | 2026-10-19 |
| [ADR-005](#adr-005-venue-uploaded-catalog)                     | Venue-uploaded catalog                     | 2026-10-19 |
| [ADR-006](#adr-006-fractional-positions-for-queue-ordering)    | Fractional positions for queue ordering    | 2026-10-19 |
| [ADR-007](#adr-007-hebrew-first-rtl-with-next-intl)            | Hebrew-first RTL with next-intl            | 2026-10-19 |

---

## ADR-001: Monorepo with pnpm and Turborepo

Date: 2026-10-19

### Context

The product has one web app today (guest PWA, DJ dashboard, admin, TV screen) and a planned local desktop bridge (phase 4). The rules engine, DB types, and translations must be shared between them with a single version of truth. We are a very small team and want one CI pipeline, one lint/format config, and atomic cross-package changes.

### Decision

Use a single repository managed by **pnpm workspaces** with **Turborepo** for task orchestration and caching. Layout: `apps/web`, `packages/queue-engine`, `packages/db`, `packages/i18n`, `supabase/`. Internal packages are consumed via `workspace:*` and built with `tsc` (no bundler) so Next.js can transpile them directly.

### Consequences

- Positive: one `pnpm install`, shared tooling, typed imports across packages, cached `lint/typecheck/test/build` in CI, trivial to add `apps/bridge` later.
- Positive: pnpm's strict node_modules catches undeclared dependencies early.
- Negative: Vercel must be configured with root directory `apps/web` and monorepo awareness; some tools need `--filter`.
- Negative: slightly more initial setup than a single Next.js app.

---

## ADR-002: Supabase over Firebase or a custom backend

Date: 2026-10-19

### Context

We need: relational data with strong multi-tenant isolation (every row belongs to a venue), authentication with Google, Microsoft, and SMS OTP to Israeli numbers, realtime queue updates to phones and the DJ screen, file storage for catalog uploads, and server-side jobs for import, with minimal operations work. Options considered: Firebase (Firestore + Firebase Auth), a custom Node/Postgres backend, Supabase.

### Decision

Use **Supabase** (managed Postgres, Auth, Realtime, Storage, Edge Functions).

Reasons:

- **Postgres + Row-Level Security** gives tenant isolation as a database guarantee, not application discipline; relational constraints (unique song per venue, one open night per venue) are natural. Firestore's document model and security rules make cross-collection fairness logic and uniqueness awkward.
- **Built-in auth providers** cover Google, Azure (Microsoft), and Phone OTP via Twilio out of the box, with a "Send SMS" hook to swap in an Israeli SMS provider later.
- **Realtime** on Postgres changes, filtered by RLS, delivers queue updates without running our own WebSocket layer.
- Storage and Edge Functions cover uploads and import processing; the service role key gives trusted server code full access.
- A custom backend would cost weeks of auth/infra work before the first song is queued.

### Consequences

- Positive: fastest path to a secure multi-tenant MVP; SQL migrations and types generated from the schema; local development via `supabase start`.
- Negative: vendor coupling (auth, realtime APIs). Mitigation: all data is plain Postgres; business logic lives in our packages and SQL, so migrating off would mean replacing auth/realtime adapters, not the model.
- Negative: Realtime has connection limits per plan; we must size for busy nights and design clients to refetch rather than depend on every event.
- Negative: RLS policies need their own tests; a mistake there is a data leak.

---

## ADR-003: Queue engine as a pure package

Date: 2026-10-19

### Context

The queue ordering rules (fairness modes, limits, cooldowns, duplicates, host overrides) are the product's core differentiator and the most likely source of subtle bugs. They must be identical wherever they run: Next.js server actions now, the VirtualDJ bridge later, possibly Postgres-adjacent jobs. They must be testable without a database.

### Decision

Implement the engine as **`packages/queue-engine`**, a pure TypeScript library with no I/O, no Supabase or framework imports, and an explicit `now: Date` parameter. Its API is `evaluateRequest(rules, state, candidate, now)` and `reorder(rules, state, now)`; the caller loads state and persists results. Config is validated with a zod schema exported by the package. Tests are Vitest unit tests covering every rule, reason code, and the documented worked example.

### Consequences

- Positive: exhaustive, fast tests; deterministic behaviour; the spec in `QUEUE_RULES.md` maps 1:1 to code; reusable in the bridge and in a future rules "preview" UI for admins.
- Negative: the server must load the full night state before each evaluation (one query for entries, one for history). Acceptable at karaoke scale (tens to low hundreds of rows per night).
- Negative: concurrency checks (two simultaneous requests from the same user) cannot be guaranteed by a pure function; the persisting RPC re-checks `maxPendingPerUser` under a row lock.

---

## ADR-004: Phase-1 manual VirtualDJ handoff

Date: 2026-10-19

### Context

Venues run VirtualDJ on a Windows PC wired to the mixer and screens. Integrating programmatically (network control, OS2L, playlist files, plugins) needs a technical spike and on-site testing, and VirtualDJ's integration surface is not fully documented. Blocking the MVP on it would delay the whole product.

### Decision

In phases 1-3 the DJ dashboard shows the ordered queue and offers one-tap copy of the song title/artist or `external_ref`; the DJ loads the track in VirtualDJ manually. Automatic sync is deferred to phase 4 as a separate local "VirtualDJ bridge" app that reuses the queue engine and Supabase realtime.

### Consequences

- Positive: the product delivers value (fair queue, no paper, guest visibility) immediately; the bridge can be designed with real nights of experience.
- Positive: the `songs.external_ref` column is captured from day one so phase 4 has the mapping it needs.
- Negative: the DJ still performs one manual action per song; mis-typed searches remain possible.
- Negative: `now_singing`/`done` transitions are manual until the bridge reports playback.

---

## ADR-005: Venue-uploaded catalog

Date: 2026-10-19

### Context

Guests must only request songs the venue can actually play. Options: a global shared song database (curated by us or scraped), or each venue uploading its own list. Venues already maintain their library in VirtualDJ and can export it; libraries differ widely (Hebrew repertoire, local versions, duets).

### Decision

Each venue **uploads its own catalog** (VirtualDJ library export XML or a simple CSV with title/artist/language/duration/external_ref) to Supabase Storage; an Edge Function parses and upserts into `songs` scoped by `venue_id` with uniqueness on `(venue_id, title, artist)`. There is no global catalog in phases 1-3.

### Consequences

- Positive: zero licensing/curation burden; perfect match between what guests see and what the DJ can play; `external_ref` enables the phase-4 bridge.
- Positive: venues can re-upload to update; the import records stats and errors.
- Negative: data quality depends on the venue's library tags (misspellings, duplicates with different casing). Mitigation: normalization (trim, case-fold, strip featuring tags) in the importer and a duplicate report.
- Negative: no cross-venue analytics on songs until a canonical mapping exists (possible phase 5 enhancement).

---

## ADR-006: Fractional positions for queue ordering

Date: 2026-10-19

### Context

The queue changes constantly: new requests insert in the middle (round-robin), the host drags entries, songs finish. Integer positions would require renumbering many rows on every change, generating realtime noise and write contention. Alternatives: linked list (prev/next pointers, fragile), integer gaps (e.g. steps of 1000, still needs renumbering), or a fractional rank.

### Decision

`queue_entries.position` is a **`numeric`** fractional rank. Insertion between neighbours `a` and `b` uses `(a + b) / 2`; appending uses `last + 1`; `reorder()` only writes rows whose position changed. Renumbering to integers happens only when neighbouring positions become too close (difference below `1e-6`), which is rare at karaoke scale.

### Consequences

- Positive: O(1) writes for insert and drag; minimal realtime events; ordering is a simple `ORDER BY position`.
- Positive: `numeric` avoids floating-point precision surprises that `double precision` would have after many halvings.
- Negative: positions are not human-readable (the UI computes 1..n display indexes client-side).
- Negative: a rare renumbering pass touches all rows of a night; clients must handle a burst of updates (they refetch rather than patch).

---

## ADR-007: Hebrew-first RTL with next-intl

Date: 2026-10-19

### Context

The first venues are in Israel; most guests read Hebrew, some prefer English, and song titles mix scripts. Right-to-left layout must be correct everywhere (navigation, queue lists, forms, the TV screen), not bolted on. Next.js 15 App Router needs an i18n library that works with Server Components.

### Decision

Hebrew (`he`) is the **default locale** and design baseline; English (`en`) is the second locale. Use **next-intl** with locale-prefixed routes (`/he/...`, `/en/...`), message catalogs in `packages/i18n`, and `<html lang dir>` set per locale. Styling uses Tailwind v4 with CSS logical properties (`ms-*`, `me-*`, `ps-*`, `start-*`) and no physical left/right utilities, so a single layout works in both directions. Design reviews happen in Hebrew first.

### Consequences

- Positive: RTL correctness is the default rather than an afterthought; adding Arabic or Russian later is a catalog plus locale metadata.
- Positive: next-intl supports Server Components, typed message keys, and ICU plurals (Hebrew has dual forms).
- Negative: contributors must avoid `ml-`/`mr-` style classes (enforced by an ESLint rule) and test both directions; some third-party components need RTL fixes.
- Negative: mixed-direction strings (Hebrew UI with English song titles) need explicit `dir="auto"` or `unicode-bidi` handling in list items.
