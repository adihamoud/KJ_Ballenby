# Architecture

## 1. System overview

```
 Guest phone (PWA)        DJ tablet/laptop        Bar TV (public screen)
        |                        |                        |
        +----------- HTTPS ------+--------- HTTPS --------+
                                 |
                      Vercel  (apps/web, Next.js 15)
                      - Server Components / Route Handlers / Server Actions
                      - uses @kj/queue-engine for rule evaluation
                                 |
            +--------------------+----------------------+
            |                    |                      |
     Supabase Postgres     Supabase Auth          Supabase Realtime
     (RLS per venue)   (Google, Microsoft,     (postgres_changes on
                        Phone OTP/Twilio)       queue_entries, song_requests)
            |
     Supabase Storage  <--  catalog uploads  -->  Edge Function: catalog-import
                                                  (service role, parses CSV/XML, upserts songs)

 Phase 4: VirtualDJ bridge (local app on DJ PC) <-- Realtime/REST --> Supabase
```

Principles:

- **Thin client, authoritative server.** Browsers never evaluate rules for real; the server (Route Handler or Server Action) runs the queue engine and writes to Postgres in one transaction.
- **Postgres is the source of truth.** The queue is rows in `queue_entries`; realtime is a notification channel, not a state store.
- **Pure logic in packages.** The rules engine has no I/O so it can be unit-tested exhaustively and reused by the phase-4 bridge.
- **Multi-tenant by construction.** Every table has `venue_id`; RLS policies, not application code, are the isolation boundary.

## 2. Monorepo layout

pnpm workspaces + Turborepo (`turbo.json` defines `lint`, `typecheck`, `test`, `build`, `e2e` pipelines with caching).

| Path                    | Package            | Responsibility                                                                                                                                                                                                                                        |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | `@kj/web`          | Next.js 15 App Router app: guest PWA, DJ dashboard, admin, public TV screen. TypeScript, Tailwind v4, next-intl (he/en, RTL), PWA manifest + service worker. Route Handlers / Server Actions call the engine and Supabase. Playwright e2e lives here. |
| `packages/queue-engine` | `@kj/queue-engine` | Pure TypeScript rules engine: `evaluateRequest()` and `reorder()`, config schema (zod), reason codes. No DB or framework dependency. Vitest unit tests.                                                                                               |
| `packages/db`           | `@kj/db`           | Supabase client factories (browser, server, service-role), generated `Database` types (`supabase gen types`), typed query helpers, and mappers between DB rows and engine inputs.                                                                     |
| `packages/i18n`         | `@kj/i18n`         | Message catalogs `he.json`, `en.json`, locale metadata (direction, date/number formats), typed message keys.                                                                                                                                          |
| `supabase/`             | -                  | `config.toml`, `migrations/`, RLS policies, `seed.sql`, Edge Functions (`functions/catalog-import`), auth hook stubs.                                                                                                                                 |
| `.github/workflows`     | -                  | CI: lint, typecheck, unit tests, build, Playwright e2e against a preview URL.                                                                                                                                                                         |
| `docs/`                 | -                  | This documentation.                                                                                                                                                                                                                                   |

Shared config: `tsconfig.base.json`, `.prettierrc`, `.editorconfig`, `.env.example` at the root. Packages are consumed via workspace protocol (`"@kj/queue-engine": "workspace:*"`).

## 3. Key flows

### 3.1 Guest requests a song

1. Guest joined a table by QR or code. The join action signed them in anonymously with Supabase Auth and called `join_table`, so they are a member of the table's group in the open night (ADR-009). The `kj_guest` cookie only carries what they see (table, venue, display name).
2. Guest taps "Request" on a song, fills in singers (themselves first, up to `maxSingersPerSong`) and an optional note. The browser calls Server Action `createSongRequest({ songId, singers, note })` with the Supabase session cookie.
3. Server creates a user-scoped Supabase client (anon key + user JWT). RLS guarantees the song and night belong to the venue the guest is active in; `join_table` runs again (idempotent) in case the night opened after the guest joined.
4. Server loads the night (`nights.rules_snapshot`, `song_requests`, `queue_entries`, songs, table labels) into the same night snapshot the DJ console uses, and maps it to the engine's `NightState`.
5. Server calls `evaluateRequest(rules, state, candidate)` from `@kj/queue-engine`.
6. If result is `{ ok: false, reason }`, the action returns the reason code; the UI shows the `queue.reject.*` message. Nothing is written.
7. If `{ ok: true, position, status }`, the server calls `rpc.submit_request`, which inserts `song_requests` (`pending` if `requireHostApproval`, else `queued`) and, when queued, `queue_entries` at the engine's position, in one transaction. The RPC re-checks `maxPendingPerUser` under a per-user advisory lock and never lets a caller land ahead of the tail.
8. Postgres emits `INSERT` on `song_requests` and `queue_entries`; Supabase Realtime fans out to subscribed clients of that `night_id` (RLS-filtered, so guests only receive their night).
9. Guest's own list (place in line, songs ahead), the DJ dashboard, and the TV screen refetch within 2 s; a 15 s poll covers a dropped channel. Cancel is a plain RLS update to `cancelled`; a trigger closes the queue entry.

Without Supabase configured the same flow runs against an in-memory demo night, one per browser (keyed by the guest cookie), so the DJ console opened in that browser shows the guest's request.

### 3.2 DJ marks a song done

1. DJ taps "Done" on the `now_singing` entry.
2. Browser calls Server Action `completeEntry({ entryId })`.
3. Server verifies via RLS that the DJ is a `venue_members` row with role `dj|admin|owner` for the entry's venue.
4. RPC `rpc.complete_entry` in one transaction: sets `song_requests.status = 'done'`, `queue_entries.ended_at = now()`, and records the singer/table history timestamps used by cooldown and round-robin.
5. Server reloads state and calls `reorder(state)` to compute the fair order; writes new fractional `position` values only for entries whose order changed and that are not `locked_by_host`.
6. Optionally (DJ setting "auto-start next"), the first entry is set to `now_singing` with `started_at = now()`.
7. Realtime `UPDATE` events propagate; the guest now at position 1 receives the "you're up next" banner/notification; the TV screen flips to the new singer.

### 3.3 DJ host action (approve, start, done, skip, pin, priority, move)

1. The console applies the action optimistically with `apps/web/src/lib/dj/queue-model.ts`: a pure function that maps the action to the data changes in QUEUE_RULES.md section 8 and calls `reorder()` from `@kj/queue-engine`.
2. The browser calls Server Action `performHostAction(nightId, action)`. The server reloads the night through the DJ's own session (RLS `is_venue_staff` authorizes), re-applies the same pure model against fresh data, and persists only the resulting field changes (`song_requests.status/priority`, `queue_entries.position/locked_by_host/started_at/ended_at`, plus one insert on approve).
3. The server returns a fresh snapshot that replaces the optimistic state. Realtime events on `queue_entries`, `song_requests` and `nights` (filtered by night) and a 15 s poll only trigger refetches.
4. Until the transactional RPC lands (roadmap phase 2), the writes are sequential statements; a failure mid-way is reported and the console refetches.

### 3.4 Catalog import

1. Admin uploads CSV/XML via the browser directly to Supabase Storage bucket `catalog-uploads/<venue_id>/<uuid>.<ext>` (RLS on storage objects: owner/admin of that venue).
2. Server Action inserts `catalog_imports` (status `pending`) and invokes Edge Function `catalog-import` with the import id.
3. Edge Function (service role) streams the file, parses rows, normalizes title/artist, upserts into `songs` on `(venue_id, title, artist)`, updates `stats`, sets status `done` or `failed` with `error`.
4. Admin UI subscribes to the `catalog_imports` row and shows progress/result.

## 4. Realtime strategy

- **Transport:** Supabase Realtime `postgres_changes` on `queue_entries` and `song_requests`, filtered by `night_id=eq.<id>`. RLS applies to realtime, so guests only receive rows they may read.
- **Channels per surface:**
  - Guest: one channel for their night; derives own position client-side from the ordered list.
  - DJ dashboard: same channel plus `nights` row (status).
  - TV screen: a Route Handler proxies a read-only view (no auth in the browser) and the page polls every 3 s as a fallback to a realtime subscription via a venue-scoped token.
- **Consistency:** clients treat realtime payloads as cache invalidation hints and refetch the ordered queue through a single `GET /api/nights/:id/queue` endpoint (or Server Component revalidation) rather than patching local state, which avoids ordering drift from out-of-order events.
- **Reconnect:** on `CHANNEL_ERROR`/`TIMED_OUT`, the client refetches and resubscribes with backoff; the UI shows a subtle "reconnecting" indicator.
- **Notifications:** "you're up next" is detected client-side when the guest's entry reaches position 1 or `now_singing`; uses the Vibration API and, if granted, Web Push via the service worker (phase 2 uses in-app banner + vibration; Web Push is best-effort).

## 5. Auth flows (high level)

All providers go through Supabase Auth (`@supabase/ssr` for cookie-based sessions in Next.js).

- **Google:** `signInWithOAuth({ provider: 'google', redirectTo: <app>/auth/callback })` -> Google consent -> `https://<project-ref>.supabase.co/auth/v1/callback` -> redirect to app `/auth/callback` which exchanges the code for a session cookie. Profile row is created by a Postgres trigger on `auth.users` insert.
- **Microsoft:** same flow with `provider: 'azure'`, scopes `email openid profile`, tenant `common` so personal and work accounts both work.
- **Email + password:** sign-up calls `signUp({ email, password, options: { data: { full_name }, emailRedirectTo: <app>/auth/callback } })`; with email confirmation on, the confirmation link returns through `/auth/callback`. Sign-in is `signInWithPassword`. "Forgot password" sends `resetPasswordForEmail` with the callback's `next` set to `/login/reset`, where `updateUser({ password })` saves the new one.
- **Phone OTP (+972):** `signInWithOtp({ phone: '+9725XXXXXXXX' })` -> Supabase sends SMS via Twilio -> guest enters 6-digit code -> `verifyOtp({ phone, token, type: 'sms' })`. Sign-in passes `shouldCreateUser: false` so unknown numbers get "create an account first"; sign-up passes `shouldCreateUser: true` and the name as `data.full_name`. UI accepts local Israeli formats and converts to E.164. Rate limiting is Supabase's default plus a per-IP limit in the Route Handler. An Israeli SMS provider can replace Twilio later through the Supabase "Send SMS" auth hook without client changes.
- **Guests:** `signInAnonymously()` from the join Server Action (ADR-009). The anonymous user is `authenticated` for RLS, gets a `profiles` row from the trigger, and is upgraded to a named account on first social or SMS login (`linkIdentity`), keeping requests and history.
- **Session:** JWT in HttpOnly cookies, refreshed by middleware; `profiles.locale` read after login to pick the locale.
- **Roles:** derived from `venue_members`, never from JWT claims, so role changes take effect immediately.

## 6. Environments

| Environment | Web                                   | Supabase                                                             | Purpose                                                                                                                            |
| ----------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Local       | `pnpm dev` on `http://localhost:3000` | `supabase start` (Docker) or a dedicated dev project                 | Day-to-day development, seed data, Playwright locally.                                                                             |
| Preview     | Vercel preview deploy per PR          | Shared staging Supabase project (or Supabase branching when enabled) | CI e2e, PR review on real phones. OAuth redirect URIs include the Vercel preview wildcard via Supabase "additional redirect URLs". |
| Production  | Vercel production (`main`)            | Production Supabase project                                          | Live venues. Migrations applied via `supabase db push` from CI on tag/merge.                                                       |

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe), `SUPABASE_SERVICE_ROLE_KEY` (server/Edge Functions only), `NEXT_PUBLIC_APP_URL`. See [SETUP_ACCOUNTS.md](./SETUP_ACCOUNTS.md).

## 7. Security principles

- **RLS everywhere.** Every public table has RLS enabled with policies keyed on `venue_id` and membership (see [DATA_MODEL.md](./DATA_MODEL.md)). Tests include negative cases (guest of venue A cannot read venue B).
- **No service key in the browser.** `SUPABASE_SERVICE_ROLE_KEY` is only available to Server Actions/Route Handlers and Edge Functions; the Next.js config never exposes it (no `NEXT_PUBLIC_` prefix), and a CI check greps the client bundle for it.
- **Server-side state transitions.** All queue mutations go through RPCs/Server Actions that validate role and run the engine; clients cannot set `status` or `position` directly (column-level grants).
- **Least-privilege roles.** `dj` can run the night; only `owner|admin` touch catalog, tables, rules, members.
- **Input validation.** zod schemas on every action; singers array capped by `maxSingersPerSong`; notes length-limited; file uploads restricted by MIME and size.
- **Secrets and tokens.** `qr_token` is a random uuid and can be rotated; TV-screen tokens are venue-scoped and read-only; OTP rate-limited.
- **Dependencies.** Renovate/Dependabot weekly; `pnpm audit` in CI.

## 8. Observability

- **Errors:** Sentry (browser + server) with release tagging from Vercel git SHA; PII scrubbing enabled (no phone numbers in events).
- **Logs:** Vercel function logs and Supabase Postgres/Edge logs; structured JSON logs from Server Actions with `venue_id`, `night_id`, `request_id` for correlation.
- **Metrics:** Vercel Analytics / Speed Insights for Web Vitals on real phones; a lightweight `events` table (phase 3) for product metrics (requests per night, rejections by reason code, wait times).
- **Health:** `/api/health` endpoint checks DB connectivity; Supabase dashboard alerts for connection and realtime limits.
- **Audit:** `queue_rules.updated_by`, `catalog_imports.uploaded_by`, and request status timestamps provide a minimal audit trail for host actions.
