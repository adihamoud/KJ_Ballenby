# Privacy, cookies and user data

What personal data KJ Ballenby holds, where it lives, how long it stays and how a person gets it
out or deleted. This is a contract like `DATA_MODEL.md`: a PR that adds a cookie, a browser
storage key, a third-party request or a personal-data field updates this file in the same PR.
The rule behind it is [ADR-012](./DECISIONS.md#adr-012-essential-cookies-only).

Status of each row: **ok** (matches the code), **gap** (see the backlog at the end).
Last checked against the code on 2026-10-25.

## 1. Principles

1. **Essential only.** Cookies and storage exist to run the night (sign-in, which table you are
   at, language). No analytics, ads or tracking, so no consent banner is needed. Adding any
   non-essential cookie needs a new ADR first.
2. **Guest pages stay first-party.** A guest's phone talks to our origin and Supabase only.
3. **Least data.** A guest gives a display name and nothing else. Phone and email come only from
   a login the person chose.
4. **Short retention.** Every personal field has a period and a mechanism that enforces it.
5. **Self-service rights.** A guest can see and delete their data from the app; a venue can
   export and delete its own data; the operator handles the rest.
6. **No people in logs.** Logs, errors and URLs carry ids, never names, phones, emails, singers
   or notes.

## 2. Cookies and browser storage

| Name                                              | Set by                                         | Purpose                                                            | Contents                                                             | Lifetime                                            | Flags                                                                             | Category  | Status |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- | --------- | ------ |
| `sb-<project-ref>-auth-token` (may split `.0/.1`) | `@supabase/ssr` (middleware, browser client)   | Signed-in session for staff and anonymous guests (ADR-009)         | Access JWT + refresh token (user id, email/phone for named accounts) | 400 days (library default); refreshed by middleware | `SameSite=Lax`, **not HttpOnly** (the browser client reads it), `Secure` on https | essential | gap G1 |
| `kj_guest`                                        | join Server Action (`lib/guest/session.ts`)    | Which table/venue this phone joined and the name shown             | `guestId` (random), table, venue, join code, display name, join time | 12 hours; cleared by "leave"                        | HttpOnly, `SameSite=Lax`, `Secure` on https                                       | essential | ok     |
| `kj_admin_demo`                                   | demo admin (`lib/admin/demo-sandbox.ts`)       | Separate in-memory demo sandbox per browser; only without Supabase | Random uuid                                                          | 12 hours                                            | HttpOnly, `SameSite=Lax`, `Secure` on https                                       | essential | ok     |
| `NEXT_LOCALE`                                     | `next-intl` 4 middleware                       | Remember a language the visitor switched to                        | `he` or `en`                                                         | Session (confirmed: no expiry set)                  | `SameSite=Lax`                                                                    | essential | ok     |
| `kj.a11y` (localStorage)                          | accessibility menu (`lib/a11y/preferences.ts`) | Accessibility settings the visitor chose (ADR-013)                 | text size, high contrast, stop animations, underline links           | Until reset in the menu or site data is cleared     | Never sent to the server; read by an inline script before paint                   | essential | ok     |
| Service worker cache                              | none today                                     | The PWA ships a web manifest only; no service worker is registered | -                                                                    | -                                                   | -                                                                                 | -         | ok     |

Apart from `kj.a11y` above, no `localStorage`, `sessionStorage` or IndexedDB keys are used
(checked with a grep on 2026-10-25). Any new key is a row here.

## 3. Third parties

| Party                                              | Who it touches                         | What it receives                                                                                                | Why                                                              | Status                            |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| Supabase (database, auth, realtime, storage)       | Everyone                               | All data in section 4; IP and user agent in auth/API logs                                                       | Backend (ADR-002)                                                | ok; region and DPA to record (G7) |
| Vercel (hosting)                                   | Everyone                               | IP, user agent, URLs in function and edge logs                                                                  | Hosting                                                          | ok; log retention to record (G7)  |
| Google, Microsoft (OAuth)                          | Staff and guests who choose that login | The login itself; we receive name, email, avatar                                                                | Sign-in                                                          | ok                                |
| Twilio (SMS OTP)                                   | Users of phone login                   | Phone number, message content (code)                                                                            | Sign-in                                                          | ok; phase 3 go-live               |
| YouTube iframe player (`www.youtube-nocookie.com`) | **Staff devices only** (DJ console)    | IP, user agent, which video and when; the standby deck requests the next song before it is sung; see note below | Play karaoke videos; preload the next one (second, muted player) | ok (G3), with the caveats below   |
| YouTube thumbnails (`i.ytimg.com`)                 | Guests (indirectly)                    | Nothing from the guest: fetched by our Next image optimizer, served from our origin                             | Song cards                                                       | ok; never `unoptimized`           |
| Sentry (planned, phase 2)                          | Everyone                               | Error events                                                                                                    | Error tracking                                                   | gap G6 (must ship scrubbed)       |

YouTube note (checked 2026-10-25). Both decks pass `host: "https://www.youtube-nocookie.com"`
to `YT.Player` (`apps/web/src/components/dj/useYouTubePlayer.ts`), so the player iframes run in
privacy-enhanced mode. That mode avoids setting cookies when the player loads, but YouTube may
still use local storage or other identifiers inside its iframe and may set cookies once a video
plays, which on the DJ console it always does. Google's own commitment is only that views in this
mode do not shape the viewer's YouTube experience and ads are not personalised
([YouTube Help 171780](https://support.google.com/youtube/answer/171780)). The `iframe_api`
script still loads from `https://www.youtube.com/iframe_api` as a third-party script request, so
any youtube.com cookies already in that browser go with it where the browser allows third-party
cookies. All of this stays on staff devices; guest pages never load YouTube.

## 4. Personal data inventory

| Where                                                       | Fields                                                                                                            | Whose     | Source                    | Retention (target)                                                             | Status |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ------------------------- | ------------------------------------------------------------------------------ | ------ |
| `auth.users` (Supabase)                                     | email, password hash (email sign-up), phone, provider ids, last sign-in, `is_anonymous`, display name in metadata | all users | login / anonymous sign-in | Named: until account deletion. Anonymous: 30 days after last activity          | gap G4 |
| `profiles`                                                  | `display_name`, `avatar_url`, `phone`, `locale`                                                                   | all users | trigger from `auth.users` | Same as the auth user (cascade)                                                | ok     |
| `venue_members`                                             | user id, role                                                                                                     | staff     | owner invite              | Until removed from the venue                                                   | ok     |
| `group_members`                                             | user id, group (= table), join time                                                                               | guests    | `join_table` RPC          | With the night; see `song_requests`                                            | gap G4 |
| `song_requests`                                             | `requested_by`, `singers` (free-text names, may name other people), `note`, timestamps, song                      | guests    | request flow              | Row kept for venue stats; `singers` and `note` cleared 90 days after the night | gap G4 |
| `queue_entries`, `nights`, `catalog_imports`, `queue_rules` | staff user ids in `*_by` columns                                                                                  | staff     | host actions              | With the venue                                                                 | ok     |
| `kj_guest` cookie                                           | display name                                                                                                      | guests    | join form                 | 12 hours                                                                       | ok     |
| Vercel / Supabase logs                                      | IP, user agent, URL                                                                                               | everyone  | platform                  | Platform defaults; to record                                                   | gap G7 |

Phone numbers are never shown to other guests (PRD section 4). Staff see participants'
`display_name` and avatar only.

## 5. Rights flows

| Right           | Guest (self-service)                                              | Venue (owner/admin)                                     | Operator                                        | Status           |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ---------------- |
| Know            | Privacy notice linked from the join page and the footer           | Same notice + venue terms                               | -                                               | G5 (ok on merge) |
| Access / export | "My data" page: profile, requests, tables joined (JSON)           | Export the venue's nights, requests, members (CSV/JSON) | On request within 30 days                       | gap G8           |
| Delete          | "Delete me": deletes the auth user, cascades profile and requests | Delete the venue (cascades everything with `venue_id`)  | On request; also removes from backups by expiry | gap G8           |
| Correct         | Edit display name                                                 | -                                                       | -                                               | gap G8           |

Deletion runs as the person through RLS or a `security definer` RPC that checks `auth.uid()`;
never the service role in a request handler.

## 6. Backlog

Ordered by when it is needed. Each line is one PR; the agent in brackets implements it, the
model is chosen per call (section 7).

| Id  | Severity | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase | Agent               |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------- |
| G5  | high     | Privacy notice page `/[locale]/privacy` (he + en), linked from the join page (at the point of collection) and the footer. Plain text, lists this file's tables in human words. Needed before the pilot night with real guests. **Done on merge of `feat/web-privacy-notice`** (spec 2026-10-25: page, footer/join/auth/request-sheet links, `e2e/privacy.spec.ts`). Pilot blocker left: owner fills `privacy.who.operator` and `privacy.who.contactEmail` (TODO in both catalogs). Update the notice copy in the same PR as any change to sections 2-4. | 2     | privacy -> frontend |
| G4  | high     | Retention jobs (pg_cron): delete anonymous users with no activity for 30 days (ADR-009 follow-up); clear `singers`/`note` 90 days after a night closes. RLS untouched, job runs as `postgres`.                                                                                                                                                                                                                                                                                                                                                          | 2     | database            |
| G3  | medium   | DJ console YouTube player on `https://www.youtube-nocookie.com` (`host` option of `YT.Player`); add the staff-device note to the notice. **Done on merge of `fix/web-dj-youtube-nocookie`** (2026-10-25): both decks (active + preload standby) pass `host`; notice `privacy.sharing.youtube` says privacy-enhanced mode, IP and "may store cookies and identifiers" on the DJ's device. Left as is: `iframe_api` still loads from `www.youtube.com` (no nocookie mirror of the script).                                                                | 2     | frontend            |
| G6  | medium   | Sentry lands with `sendDefaultPii: false`, a `beforeSend` that drops request bodies and cookies, user context = id only. privacy-audit blocks it otherwise.                                                                                                                                                                                                                                                                                                                                                                                             | 2     | devops              |
| G1  | medium   | Decide whether to cap the Supabase session cookie's max-age (e.g. 30 days for anonymous guests). ARCHITECTURE.md already states it is not HttpOnly. "Leave table" clears only `kj_guest`; the anonymous session stays. The G5 notice says "up to 400 days"; change that copy with the cap.                                                                                                                                                                                                                                                              | 2     | privacy -> frontend |
| G2  | low      | Done for `NEXT_LOCALE` (session cookie, asserted in `e2e/privacy.spec.ts`). When a service worker is added, it caches static assets only, never API or page responses with personal data; add its row to section 2.                                                                                                                                                                                                                                                                                                                                     | 2     | frontend            |
| G8  | high     | Guest "My data" (view, export JSON, edit name, delete me) and venue export/delete (ROADMAP phase 3 "Data export/delete per venue").                                                                                                                                                                                                                                                                                                                                                                                                                     | 3     | database + frontend |
| G7  | medium   | Record Supabase region, Vercel/Supabase log retention and both DPAs; set the shortest log retention the plans allow.                                                                                                                                                                                                                                                                                                                                                                                                                                    | 3     | privacy + devops    |
| G9  | medium   | Data-security basics for the database (Israeli Data Security Regulations): access list of who can reach production, MFA on Supabase/Vercel/GitHub, breach-notification runbook.                                                                                                                                                                                                                                                                                                                                                                         | 3     | privacy + devops    |
| G10 | -        | Legal: terms, full privacy policy, per-venue data processing terms, controller/processor split between venue and platform. Needs counsel.                                                                                                                                                                                                                                                                                                                                                                                                               | 5     | privacy (draft)     |

### Open questions (recommended default in brackets)

- Who is the controller of guest data: the venue, the platform, or both? [Platform is controller
  for accounts and the app; venue is controller for its own night data and we process it for
  them. Confirm with counsel before phase 5.]
- Retention of `song_requests` rows for stats. [Keep rows, clear free text after 90 days;
  aggregate stats never name a person.]
- Session length for anonymous guests. [30 days, so a regular keeps their history between
  visits without a 400-day cookie.]
- Database registration duty under the Israeli Privacy Protection Law after Amendment 13.
  [Likely not required at our size; confirm with counsel.]
- Is the G5 notice enough as the section 11 collection notice? It covers voluntary/required,
  purpose, operator, recipients, consequence of refusal and access/correction rights, per the
  summary in [Chambers 2026: Israel](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/israel)
  (secondary source, not the statute). [Ship it for the pilot as a notice, not a reviewed policy;
  counsel reviews with G10.]
- Operator identity and privacy contact for the notice. [Owner supplies the legal name and a
  monitored mailbox before the pilot; the catalogs hold TODO placeholders until then.]
- Verifying a deletion/access request from an anonymous guest, who has no email or phone.
  [Ask for venue, night and display name; delete matching data without further proof, since the
  data is low-risk and deletion is the safer error; never disclose data to an unverified asker.
  G8 self-service removes the problem.]
- Supabase and Vercel may store data outside Israel (Transfer of Data to Databases Abroad
  Regulations). [Record regions and DPAs in G7; the notice already says servers may be abroad.]
- Anonymous guest session lasts 400 days (G1). [Cap at 30 days before or soon after the pilot
  and update the notice copy.]

## 7. Agents and models

Who does what in this workstream, and which model each runs on. Prices are per million
input/output tokens (2026-10).

| Agent                 | Model               | Price         | Used for                                                                                        | Why this model                                                                                                                                       |
| --------------------- | ------------------- | ------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `privacy` (new)       | Opus 5.5            | $4 / $20      | Decisions, register upkeep, retention design, notice copy, ADRs, legal mapping                  | Judgment work that is rare per PR, where a wrong call costs much more than the tokens. Fable 5.1 ($10 / $50) is not worth it for short design tasks. |
| `privacy-audit` (new) | Haiku 5.5           | $0.10 / $0.50 | Every PR touching `apps/web`, `supabase/`, `packages/db`: grep the diff, compare with this file | Mechanical and frequent: 20x cheaper than Sonnet. Escalates anything unclear to `privacy` instead of judging it.                                     |
| `database` (existing) | Sonnet 5.5 per call | $2 / $10      | Retention jobs, delete/export RPCs, cascades                                                    | Well-specified work with tests and a written plan; half the price of Opus.                                                                           |
| `frontend` (existing) | Sonnet 5.5 per call | $2 / $10      | Privacy page, "My data" UI, he/en copy, nocookie player                                         | Same reasoning.                                                                                                                                      |
| `qa` (existing)       | Opus 5.5            | $4 / $20      | Final review of delete/export PRs                                                               | Security-sensitive: a missed RLS hole outweighs the cost.                                                                                            |

Existing agents keep `model: inherit`; the lead (the main session) passes `model: "sonnet"` on
the Agent call for privacy implementation work, so their other uses are unchanged.

Flow per backlog item: `privacy` writes the plan and acceptance test (Opus), `database` /
`frontend` implement it (Sonnet), `privacy-audit` gates the diff (Haiku), `qa` reviews
deletion and export PRs (Opus).
