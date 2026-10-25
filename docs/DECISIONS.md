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
| [ADR-008](#adr-008-guest-access-before-sign-in)                | Guest access before sign-in                | 2026-10-23 |
| [ADR-009](#adr-009-anonymous-sign-in-as-the-guest-identity)    | Anonymous sign-in as the guest identity    | 2026-10-23 |
| [ADR-011](#adr-011-automatic-versioning-with-release-please)   | Automatic versioning with release-please   | 2026-10-25 |
| [ADR-012](#adr-012-essential-cookies-only)                     | Essential cookies only                     | 2026-10-25 |

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

---

## ADR-008: Guest access before sign-in

Date: 2026-10-23

### Context

The guest journey starts at the table: scan the QR, pick a song. Phase 1 wires Google, Microsoft and SMS login, but forcing a provider consent screen before a guest even sees their table adds taps and drop-off, and auth is the last piece of phase 1 to land. We want the join flow (`/j/<qr_token>`, code fallback) and the guest home to be usable and testable now, and to attach a signed-in identity later without redesigning the pages.

### Decision

Guests **join a table without an account**. The QR token or typed code is resolved by the `resolve_table` RPC (`security definer`, callable by `anon`), which only returns an active table of an active venue plus whether a night is open; it writes nothing and exposes no personal data. The result and the guest's chosen display name live in an HttpOnly `kj_guest` cookie for 12 hours. Nothing in the database is written on behalf of this cookie: it drives what the guest sees, not what they can do.

When song requests ship (phase 2), the guest identity becomes server-verifiable: either Supabase anonymous sign-in upgraded to a full account on first login, or a signed guest token issued by the join action. Social and SMS login stay as the way to keep history across nights and to unlock staff roles. Without Supabase configured, the web app serves the demo venue from `supabase/seed.sql` in memory so CI and previews exercise the flow.

### Consequences

- Positive: a guest is at their table in two taps (scan, name); the join flow, copy and RTL layout are exercised before auth lands.
- Positive: `resolve_table` is the single lookup for QR and code, reused by the signed-in flow later.
- Negative: the cookie is unsigned and client-forgeable, so it must never authorize a write; the request flow needs the upgrade above before any guest mutation.
- Negative: a join code is unique per venue, not globally; while codes are resolved without a venue context, the first active match (by creation time) wins. Printed QR tokens are globally unique and unaffected.

## ADR-009: Anonymous sign-in as the guest identity

Date: 2026-10-23

### Context

ADR-008 lets a guest join a table with nothing but an unsigned `kj_guest` cookie, and states that the
cookie must never authorize a write. The song request flow is the first guest write: it inserts
`song_requests` (and `queue_entries` when no approval is needed) and later cancels them. The schema and
RLS policies from the start assume `song_requests.requested_by` is an `auth.users` id and that the guest
is a member of a group in the night (`is_night_participant`). Two options were on the table: a signed
guest token minted by the join action and verified by our own code, or Supabase anonymous sign-in.

### Decision

The join action signs the guest in **anonymously with Supabase Auth** (`signInAnonymously`, display
name in the user metadata) when the phone has no session yet. The anonymous user is a real
`auth.users` row with role `authenticated`, so every existing policy works as written: `requested_by =
auth.uid()`, `is_night_participant`, realtime filtered by RLS, staff reading participants' profiles.
The `kj_guest` cookie stays for display only (table, venue, chosen name) plus a random `guestId` that
keys the in-memory demo night when Supabase is not configured.

Two RPCs (`security definer`, callable by `authenticated`) complete the flow:

- `join_table(table_id)` finds or creates the table's group in the venue's open night and puts the
  caller in it (one table per guest per night). The join action calls it, and the request action calls it
  again so a guest who joined before the DJ opened the night still passes `is_night_participant`.
- `submit_request(night_id, song_id, singers, note, position)` inserts the request and its queue entry in
  one transaction. It reads the rules from `nights.rules_snapshot`, re-checks every guest-facing rule of
  QUEUE_RULES.md section 3 in the engine's order (cutoff, song active, duets, singer count, per-user and
  per-table quotas under a per-user advisory lock, cooldown, duplicate window), derives
  `table_id`/`group_id` from the caller's membership and never lets the caller place an entry ahead of
  the current tail. The Server Action runs `evaluateRequest` from `@kj/queue-engine` first and shows the
  guest the reason; the RPC exists so a direct call with the guest's own session cannot do anything the
  engine would have refused. The engine and its tests stay the specification; the SQL mirrors it and
  must change with it.

Anonymous users are upgraded to a full account on first social or SMS login (`linkIdentity` /
`updateUser`), which keeps their requests and history across nights. The Supabase project must have
**Anonymous sign-ins** enabled (Authentication > Providers); `docs/SETUP_ACCOUNTS.md` has the step.

### Consequences

- Positive: no custom token format, signing key or verification code to maintain; RLS and realtime
  authorization stay uniform between guests and staff.
- Positive: the upgrade path to a named account is a Supabase primitive, not a data migration.
- Negative: every joining phone creates an `auth.users` row; a scheduled cleanup of anonymous users
  older than 30 days with no requests belongs in phase 3.
- Negative: anonymous sign-in must be enabled per project and is rate-limited by Supabase (30 per hour per
  IP by default); venues with many guests behind one NAT need the limit raised.
- Negative: the request flow needs a server round-trip for identity; when sign-in fails (provider
  disabled, rate limit) the guest can still browse but gets a clear "unavailable" message on request.

## ADR-011: Automatic versioning with release-please

Date: 2026-10-25

### Context

Nothing said which build a guest, DJ or tester was looking at, and there was no record of what
changed between deploys. Commits already follow conventional commits (CLAUDE.md), which carry
enough to derive a version bump and a changelog. We want no manual step per release beyond
merging a PR, and nothing that can drift out of sync.

### Decision

Use **release-please** (`googleapis/release-please-action`, `.github/workflows/release.yml`) on
every push to `main`. It keeps one release PR that bumps `version` in the root `package.json` and
`apps/web/package.json`, updates `.release-please-manifest.json` and prepends the release to
`CHANGELOG.md`. Merging it tags `vX.Y.Z` and publishes a GitHub release. One product version for
the repo; the internal `packages/*` are private and not versioned separately.

Semver while below 1.0: `feat` bumps minor, `fix`/`perf`/`refactor`/`revert` bump patch, breaking
changes bump minor. `docs`, `style`, `test`, `chore`, `build`, `ci` stay out of the changelog.
PRs are **squash-merged only**, with the PR title as the commit subject and a blank body, so one PR
is one changelog line. CI rejects non-conventional PR titles (`.github/workflows/pr-title.yml`,
`scripts/check-pr-title.mjs`). Merge commits are disabled in the repo settings: GitHub copies the
PR title into the merge commit, and release-please counted it as a second change (0.2.0 listed
PR #14 twice); no merge-commit setting avoids that.

`next.config.ts` inlines the web app's version, the short commit (Vercel / GitHub / git) and a
channel (`preview` on Vercel previews, `dev` locally) as `NEXT_PUBLIC_APP_*`. The root layout
renders them in a small footer on every page (`VersionFooter`), hidden in print.

The `release` agent (`.claude/agents/release.md`) checks PR titles before PRs open, reviews the
release PR and fixes notes; it never bumps versions or tags by hand.

### Consequences

- Positive: every screenshot and bug report names its version and commit; the changelog writes
  itself from history we already keep.
- Positive: a release is one merge, owned by the repo owner.
- Negative: the release PR opened with `GITHUB_TOKEN` does not trigger CI. Set a
  `RELEASE_PLEASE_TOKEN` secret (fine-grained PAT) to get checks on it; the workflow uses it when
  present. The repo setting "Allow GitHub Actions to create and approve pull requests" must be on.
- Negative: changelog quality is only as good as PR titles; the title check enforces the
  shape, the release agent the wording.
- Negative: `CHANGELOG.md` and the manifest are excluded from Prettier, since release-please
  writes its own format.

## ADR-012: Essential cookies only

Date: 2026-10-25

### Context

Guests reach the app by scanning a QR code at a bar table. Every extra screen costs requests, and
a consent banner on a 360px phone covers the song search. The app already sets only cookies it
needs to work (Supabase session, `kj_guest`, the locale), and thumbnails are proxied through our
own origin. Israeli privacy law (with Amendment 13) and, for EU visitors, GDPR/ePrivacy require
consent for non-essential cookies and tracking, and a notice at the point of collection in any
case. Nothing recorded which cookies exist or how long personal data is kept.

### Decision

The product uses **strictly necessary cookies and storage only**: sign-in, the guest's table and
name, language, the offline shell. No analytics, advertising or tracking cookies, no
fingerprinting and no third-party scripts on guest pages, so no consent banner. Product metrics
come from our own database (`events` table, phase 3), not from a tracker. Embeds on staff screens
use privacy-enhanced hosts where the vendor offers one.

`docs/PRIVACY.md` is the register: every cookie, storage key, third party and personal field with
purpose, lifetime and retention, updated in the PR that changes it. The `privacy` agent owns it;
the `privacy-audit` agent checks each diff against it.

### Consequences

- Positive: no banner on the guest's path; the notice is a link on the join page and the footer.
- Positive: a short, checkable list of what we store, which is the base for export, deletion and
  a privacy policy.
- Negative: no third-party product analytics. Web Vitals and usage numbers must be first-party or
  cookieless; adding a tracking tool needs a new ADR that supersedes this one and designs the
  consent flow.
- Negative: every PR that touches cookies, storage or personal fields carries a docs change.
