# Product Requirements Document (PRD)

Status: living document. Covers phases 1-3 unless noted. See [ROADMAP.md](./ROADMAP.md) for phasing.

## 1. Problem

Karaoke bars run their song queue on paper slips, WhatsApp messages, or shouted requests. The DJ (host) spends the night transcribing titles, hunting for tracks in VirtualDJ, remembering whose turn it is, and fielding "when am I up?" questions. Guests do not know where they stand, duets are coordinated verbally, and the same crowd-pleaser gets sung three times a night.

KJ_Ballenby replaces this with:

- A mobile web app (installable PWA, no app store) where guests join their table by QR code, search the venue's catalog, and request songs alone or with friends.
- A rules engine that orders the queue fairly per venue (round-robin by table or singer, cooldowns, duplicate protection, host approval).
- A live DJ dashboard that shows the ordered queue in realtime; the DJ loads the track in VirtualDJ manually (phase 1-3) or via a local bridge (phase 4).
- Optional public "now singing / up next" screen for the bar TV.

It is multi-venue from day one: every venue has its own catalog, tables, staff, rules, and data isolation (row-level security).

## 2. Users and personas

| Persona        | Who                                                            | Device                                    | Primary goals                                                                                  |
| -------------- | -------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Guest          | Bar patron, 18-50, Hebrew or English speaker, often in a group | Own phone, mobile browser / installed PWA | Join fast, find a song, request it (solo or duet), know when they're up.                       |
| DJ / Host      | Runs the karaoke night; operates VirtualDJ, mixer, mic         | Tablet or laptop at the DJ booth          | See the fair queue, approve/skip/reorder, load the right track, keep the night moving.         |
| Venue admin    | Owner or manager of a bar                                      | Laptop, occasionally phone                | Upload/maintain catalog, print table QR codes, configure rules, manage staff, see basic stats. |
| Platform admin | KJ_Ballenby operator                                           | Laptop                                    | Create venues, assign owners, monitor health (phase 5: self-onboarding and billing).           |

## 3. User stories and acceptance criteria

Priority: **P1** = phase 2 core, **P2** = phase 3, **P3** = later.

### 3.1 Guest

**G1. Sign in (P1).** As a guest I can sign in with Google, Microsoft, email and password, or an SMS code sent to my +972 phone.

- The landing page asks first: new user (`/signup`), existing user (`/login`) or guest (`/join`, no account). Sign-up and sign-in offer the same four methods; sign-up also asks for a name for email and phone.
- Each method completes in under 3 taps after provider consent.
- Phone input accepts local format (`05X-XXXXXXX`) and normalizes to E.164 `+9725XXXXXXXX`.
- A `profiles` row exists after first login with `display_name` prefilled from the provider (or asked for after phone login).
- Session persists across PWA relaunches.

**G2. Join a table by QR (P1).** As a guest I scan the QR on my table and land in that venue and table.

- QR encodes `https://<app>/j/<qr_token>`; opening it (signed-in or not) ends with the guest in the right venue/table.
- Fallback: a "enter table code" field accepts the `join_code` (case-insensitive) and resolves to the same table.
- Inactive tables, inactive venues, or venues with no open night show a clear message, not an error page.

**G3. Form or join a group (P1).** As a guest I am in a group that shares a request list.

- Scanning a table QR joins me to the table's current active group, or creates one if none exists.
- I can create an ad hoc group (no table) and invite friends by sharing a link.
- Group members see each other's requests and statuses in realtime (< 2 s).
- I can leave a group; my pending requests stay attributed to me.

**G4. Search the catalog (P1).** As a guest I find songs the venue actually has.

- Search by title or artist, Hebrew or Latin script, with partial matching; first results appear within 300 ms on a 3-year-old phone over 4G.
- Only `songs.is_active = true` rows for the current venue are shown.
- Filter by language (he / en / other) when the venue provides it.

**G5. Request a song (P1).** As a guest I request a song, solo or with co-singers.

- Request sheet shows the song, lets me add up to `maxSingersPerSong` singer names (free text, prefilled with group members), and an optional note.
- Submission is validated by the rules engine; a rejection shows a localized reason (for example "You already have a song waiting").
- On success I see the request in my list with its status.

**G6. See my queue position (P1).** As a guest I know when I am up.

- My request card shows its position and an estimated wait (songs ahead x average duration).
- Position updates in realtime without refresh.
- When I move to position 1 or status becomes `now_singing`, I get an in-app banner and, if permitted, a push/vibration notification ("You're up next!").

**G7. Cancel a request (P1).** As a guest I can cancel my own request while it is `pending`, `approved`, or `queued`.

- Cancel button present only in those statuses; result is `cancelled` and it leaves the queue.

**G8. Language (P1).** As a guest the app is in Hebrew by default and I can switch to English.

- Layout is RTL in Hebrew and LTR in English; choice stored in `profiles.locale` and respected on next login.

### 3.2 DJ / Host

**H1. Open and close a night (P1).** As a DJ I start a night so guests can request, and close it at the end.

- "Open night" creates `nights` with `rules_snapshot` copied from `queue_rules`.
- Only one open night per venue at a time.
- Closing marks remaining `queued`/`approved` requests as `skipped` after confirmation.

**H2. Live queue (P1).** As a DJ I see the ordered queue update live.

- Dashboard lists queue entries in engine order with song, singers, table, requested time, and status; updates in < 2 s.
- The "now singing" entry is visually distinct; the next three are highlighted.
- Works on a 10-inch tablet in landscape and a laptop.

**H3. Control the queue (P1).** As a DJ I can approve, start, finish, skip, reorder, and pin.

- Approve (when `requireHostApproval`) moves `pending` to `queued` and the engine assigns a position.
- "Start" sets `now_singing` and `queue_entries.started_at`; "Done" sets `done` and `ended_at` and advances the queue.
- Drag-reorder assigns a fractional position between neighbors; pin locks the entry so `reorder()` does not move it.
- Set priority (when `hostPriorityEnabled`) and see the entry move accordingly.

**H4. Find the track (P1).** As a DJ I can copy the song's `external_ref` or title/artist to search in VirtualDJ in one tap.

- Each entry has a "copy" action; the dashboard never requires a mouse.

**H5. Manual add (P2).** As a DJ I can add a walk-up request on behalf of a guest or table without the guest having a phone.

**H6. Player and mixer (P1).** As a DJ I can play the song's karaoke video and balance music and mic from the same screen, so a venue without VirtualDJ can still run the night.

- The player cues the embeddable YouTube version of the song on the mic (or of the next entry while nobody sings) and never autoplays; the DJ presses play when the singer is ready.
- Version chips switch between the song's linked videos; non-embeddable ones open on YouTube.
- Mixer: music volume, tempo and a 3 s fade-out; a browser microphone channel (gain, echo, level meter) through Web Audio; one master mute. The browser only reaches the default output, so the venue's hardware mixer stays in charge of the PA.
- Queue, player and mixer share one screen on a laptop or 10-inch tablet and become tabs on a phone.

### 3.3 Venue admin

**A1. Catalog upload (P1).** As an admin I upload my song list and guests can search it minutes later.

- Accepts VirtualDJ library export (XML) or CSV with at least `title, artist`; optional `language, duration_sec, external_ref`.
- Upload creates a `catalog_imports` row; processing is asynchronous and shows progress and a stats summary (inserted, updated, skipped, errors).
- Re-uploading upserts on `(venue_id, title, artist)`; songs missing from the new file can optionally be deactivated.

**A2. Tables and QR codes (P1).** As an admin I create tables and print their QR codes.

- Create/rename/deactivate tables; generate a printable PDF/PNG sheet of QR codes with labels and join codes.
- Regenerate `qr_token` for a table (old QR stops working).

**A3. Rules configuration (P2).** As an admin I configure the queue rules for my venue.

- Form covers every key in [QUEUE_RULES.md](./QUEUE_RULES.md) with defaults, validation, and help text.
- Changes apply to the next opened night (current night keeps its `rules_snapshot`) unless the admin chooses "apply now".

**A4. Staff management (P2).** As an admin I invite staff as `dj` or `admin`, and remove them.

**A5. Public screen (P2).** As an admin I open a full-screen URL for the bar TV showing "now singing" and "up next" with singer names and table.

- No login required; read-only; tolerant of a venue-specific access token in the URL.

**A6. Basic stats (P2).** As an admin I see per night: songs sung, unique singers, most requested songs, average wait.

### 3.4 Platform admin

**P1. Create venue (P1).** As a platform admin I create a venue with slug, name, timezone, and assign the first owner (via SQL/Supabase dashboard in phases 1-3; UI in phase 5).

**P2. Observe (P2).** As a platform admin I can see error rates and realtime connection health across venues.

## 4. Non-functional requirements

- **Mobile-first.** Designed for 360-430 px wide screens; touch targets at least 44 px; one-hand reachable primary actions.
- **Performance on older phones.** Usable on a 3-year-old mid-range Android or iPhone: initial load under 3 s on 4G, interactive catalog search, no layout jank. Keep client JS lean; stream server components.
- **RTL first.** Hebrew is the default locale; all layouts use logical CSS properties (`margin-inline-start`, etc.) and are verified in both directions.
- **Realtime latency.** Queue and status changes are visible to all connected clients within 2 s (p95).
- **PWA.** Installable (manifest, icons, service worker), works over HTTPS, caches the app shell; offline shows a friendly "reconnecting" state rather than a broken page.
- **Accessibility basics.** Semantic HTML, labelled controls, visible focus, contrast >= 4.5:1, screen-reader friendly queue list, no colour-only status cues.
- **Multi-tenancy and security.** Every row carries `venue_id`; row-level security enforces isolation; no service-role key in the browser.
- **Availability.** Target 99.5 % during venue operating hours; a Supabase or Vercel incident must not corrupt queue state (all transitions are server-side and idempotent).
- **Privacy.** Store only what is needed (name, avatar, phone for OTP); phone numbers never shown to other guests; data per venue can be exported/deleted on request.
- **Localization.** All user-facing strings in message catalogs (`packages/i18n`); no hard-coded text.
- **Testing.** Queue engine has unit tests for every rule and reason code; critical guest and DJ flows covered by Playwright e2e in CI.

## 5. Out of scope for phases 1-3

- Payments, tips, paid priority, or any billing (phase 5).
- Automatic track loading into VirtualDJ (phase 4 bridge).
- Native iOS/Android apps or app-store distribution.
- Guest-uploaded songs, YouTube/streaming lookup, lyrics display.
- Scoring, ratings, leaderboards, or social features beyond the group.
- Venue self-service signup (venues are created by the platform admin until phase 5).
- Multi-room venues (one queue per night per venue).
- Non-Israeli phone numbers for SMS OTP (Google/Microsoft remain available to everyone).
