# Roadmap

Five phases. Each phase ships to production behind the previous one; a phase is "done" only when every "done when" criterion holds in the production environment.

Legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Phase 1 - Foundation (in progress)

**Goal:** A deployed, authenticated, bilingual app shell with CI and documentation, so every later feature lands on solid ground.

Deliverables:

- [~] pnpm + Turborepo monorepo scaffold (`apps/web`, `packages/queue-engine`, `packages/db`, `packages/i18n`, `supabase/`)
- [~] Next.js 15 App Router app with TypeScript, Tailwind v4, PWA manifest and service worker
- [~] next-intl wired with `he` (RTL, default) and `en` catalogs; `dir` attribute switches with locale
- [~] Supabase project created; CLI linked; initial migration with `profiles` + trigger from `auth.users`
- [~] Google and Microsoft (Azure) login working end to end via Supabase Auth
- [~] Phone OTP provider configured (Twilio) in test mode, UI accepts +972 numbers
- [~] GitHub Actions CI: lint, typecheck, Vitest unit tests, Playwright smoke test, build
- [~] Vercel project linked to the GitHub repo with preview deploys per PR and production on `main`
- [~] Environment variables and secrets documented (`.env.example`, `SETUP_ACCOUNTS.md`)
- [~] Documentation set in `docs/` (this folder)
- [~] Agent setup: `.claude/` project instructions, conventions, and commands

Done when:

- `main` deploys to a public HTTPS URL; a guest can sign in with Google and with Microsoft and see a localized home page in Hebrew and English.
- CI is green on a PR and blocks merge on failure.
- `pnpm install && pnpm dev` works from a clean clone with the documented env vars.
- `supabase db reset` applies migrations and seed without error.

## Phase 2 - Core

**Goal:** Run a real karaoke night: guests join by QR, request from the venue's catalog, the engine orders the queue, and the DJ runs it live.

Deliverables:

- [ ] Full schema from `DATA_MODEL.md` with RLS policies and negative-case RLS tests
- [x] Venue + table admin pages; printable QR sheet; `resolve_table` RPC and `/j/<qr_token>` join flow with code fallback (RPC, `/join`, `/j/<token>` and guest home without sign-in, see ADR-008; `/admin/tables` adds, renames, deactivates and re-codes tables through Server Actions under RLS, `/admin/qr` prints one A4 card per active table with the QR of `/<locale>/j/<qr_token>` and the typed code; `/admin/queue` gives owners and admins the DJ console's queue manager (move up/down, pin, priority, approve, start, done, skip, open/close night) without the player, sharing the console's `useDjNight` state hook; staff selection across several venues pending)
- [~] Groups: auto-join table group, ad hoc groups with share link, member list (`join_table` RPC auto-joins the table group at join and request time, ADR-009; ad hoc groups, share link and member list pending)
- [ ] Catalog upload (CSV + VirtualDJ XML) to Storage; `catalog-import` Edge Function; import status UI
- [~] Catalog search (tsvector + prefix) with language filter, fast on older phones (guest home search with YouTube versions and thumbnails via `search_songs`; perf check on real phones pending)
- [x] Request flow with singers, note, rules evaluation, localized rejection reasons (`createSongRequest` runs `evaluateRequest`, then the `submit_request` RPC; `queue.reject.*` in he/en)
- [ ] `@kj/queue-engine` complete: `evaluateRequest`, `reorder`, all reason codes, worked-example tests
- [~] Server Actions/RPCs for submit, approve, start, done, skip, reorder, pin, priority (transactional) (submit is the transactional `submit_request` RPC; host actions are Server Actions over RLS in `apps/web/src/lib/dj/actions.ts`, a transactional RPC for them pending)
- [~] DJ dashboard: realtime ordered queue, controls, copy-to-VirtualDJ action, open/close night (console at `/dj` with queue manager, YouTube player and browser mixer; realtime invalidation + polling; drag-and-drop reorder by a grip handle with mouse, touch or keyboard, plus up/down arrows, also on `/admin/queue`)
- [~] Guest queue view with position, estimated wait, realtime updates, "you're up next" banner + vibration (own requests with place in line, songs ahead, realtime refetch + polling and an "up next" banner on the guest home; estimated wait and vibration pending)
- [x] Guest cancel own request
- [~] Playwright e2e: join -> search -> request -> DJ done -> position updates (join, search, request, rejection, cancel and DJ-sees-request covered on the demo night in `e2e/guest-request.spec.ts`; DJ done -> position update pending a server-backed demo DJ)
- [ ] Error tracking (Sentry) and structured logs

Done when:

- A pilot venue runs one full night with at least 20 requests from real guests without the DJ touching paper.
- Realtime updates reach guest and DJ screens in under 2 s (p95) measured in production.
- Every rule and reason code has a passing unit test; RLS negative tests pass in CI.
- Guest of venue A cannot see any data of venue B (verified by test).

## Phase 3 - Admin and screen

**Goal:** Venue staff can self-manage rules, staff, and the TV screen; SMS login is live; basic stats exist.

Deliverables:

- [~] Rules configuration UI covering every `RulesConfig` key with validation and "apply now / next night" (`/admin/settings` edits the venue name and every key of `queue_rules.config`, validated by the engine's `parseRules`; rules apply to the next night opened, "apply now" to a running night pending)
- [ ] Staff management: invite by email/phone, roles `owner|admin|dj`, remove, last-owner protection
- [ ] Public TV screen route: "now singing" + "up next", venue branding from `venues.settings`, no login
- [ ] DJ manual add (walk-up request) and host priority controls
- [ ] Basic stats per night and per venue: songs sung, unique singers, top songs, average wait, rejections by reason
- [ ] SMS OTP go-live: Twilio production credentials, +972 formatting, rate limits, abuse monitoring
- [ ] Accessibility pass (focus, contrast, screen reader labels) and RTL audit on both locales
- [ ] Data export/delete per venue (privacy requests)

Done when:

- An admin changes a rule and the next night behaves accordingly without developer involvement.
- The TV screen runs for a whole night without manual refresh.
- A guest with only a phone number signs in via SMS in production.
- Stats page shows correct numbers for the previous night, cross-checked against the DB.

## Phase 4 - VirtualDJ bridge

**Goal:** Remove the manual handoff: the DJ PC receives the queue and loads tracks automatically.

Deliverables:

- [ ] Local bridge app (Windows, Node/Electron or Tauri) authenticating as a venue `dj` with a device token
- [ ] Realtime subscription to the venue's open night; mirrors the queue into a VirtualDJ-compatible playlist/sidelist (via VirtualDJ network control, OS2L, or file-based playlist, after spike)
- [ ] Mapping `songs.external_ref` to local files; report of unmapped songs back to the admin UI
- [ ] Bridge reports playback start/end so `now_singing`/`done` can be set automatically (DJ can still override)
- [ ] Reuse `@kj/queue-engine` in the bridge for offline-tolerant ordering display
- [ ] Installer, auto-update, and troubleshooting guide

Done when:

- At the pilot venue, the DJ's only actions for a standard song are "start" and "done" (or none when auto-mode is on), and the queue in VirtualDJ matches the dashboard within 2 s.
- Bridge recovers from network loss without duplicating or losing entries.

## Phase 5 - SaaS

**Goal:** Any venue can onboard and pay without the platform operator's help.

Deliverables:

- [ ] Venue self-onboarding: create venue, claim slug, upload catalog, print QR, invite staff
- [ ] Billing (Stripe or Israeli PSP) with plans and venue-level subscription status gating features
- [ ] Multi-venue super-admin console: venues, usage, health, impersonation with audit log
- [ ] Israeli SMS provider via Supabase "Send SMS" auth hook (cost and deliverability)
- [ ] Legal: terms, privacy policy, data processing per venue
- [ ] Marketing site and docs for venue owners

Done when:

- A new venue signs up, pays, and runs a night with no manual steps from the platform operator.
- Super-admin can see every venue's status and suspend one.
