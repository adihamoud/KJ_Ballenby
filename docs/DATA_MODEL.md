# Data Model

All tables live in the `public` schema of Supabase Postgres. Conventions:

- Primary keys are `uuid` (`gen_random_uuid()`) unless stated otherwise.
- Every table has `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` (maintained by a shared `set_updated_at()` trigger), except where noted.
- Every tenant-owned table carries `venue_id uuid not null references venues(id)`; it is the RLS boundary.
- Enumerations are Postgres `enum` types or `text` with a `check` constraint; the allowed values are listed per column.
- `auth.users` is Supabase's managed table; `profiles` mirrors it 1:1.

## 1. Tables

### profiles

One row per authenticated user, created by a trigger on `auth.users` insert.

| Column       | Type                       | Notes                                         |
| ------------ | -------------------------- | --------------------------------------------- |
| id           | uuid PK                    | `references auth.users(id) on delete cascade` |
| display_name | text                       | From provider or asked after phone login      |
| avatar_url   | text null                  |                                               |
| phone        | text null                  | E.164, copied from `auth.users.phone`         |
| locale       | text not null default 'he' | check in (`he`, `en`)                         |
| created_at   | timestamptz                |                                               |
| updated_at   | timestamptz                |                                               |

### venues

| Column                  | Type                                   | Notes                             |
| ----------------------- | -------------------------------------- | --------------------------------- |
| id                      | uuid PK                                |                                   |
| slug                    | text unique not null                   | URL-safe, lowercase               |
| name                    | text not null                          |                                   |
| timezone                | text not null default 'Asia/Jerusalem' | IANA zone                         |
| default_locale          | text not null default 'he'             | check in (`he`, `en`)             |
| settings                | jsonb not null default '{}'            | Branding, TV-screen options, misc |
| is_active               | boolean not null default true          |                                   |
| created_at / updated_at | timestamptz                            |                                   |

### venue_members

Staff of a venue. Guests are **not** members; they are linked through `group_members`.

| Column                  | Type          | Notes                             |
| ----------------------- | ------------- | --------------------------------- |
| venue_id                | uuid          | FK venues                         |
| user_id                 | uuid          | FK profiles                       |
| role                    | text not null | check in (`owner`, `admin`, `dj`) |
| created_at / updated_at | timestamptz   |                                   |

PK `(venue_id, user_id)`.

### venue_tables

| Column                  | Type                                    | Notes                                          |
| ----------------------- | --------------------------------------- | ---------------------------------------------- |
| id                      | uuid PK                                 |                                                |
| venue_id                | uuid                                    | FK venues                                      |
| label                   | text not null                           | e.g. `T12`, `Bar 3`                            |
| join_code               | text not null                           | Short (4-6 chars), unique per venue, uppercase |
| qr_token                | uuid not null default gen_random_uuid() | Encoded in the printed QR; rotatable           |
| is_active               | boolean not null default true           |                                                |
| created_at / updated_at | timestamptz                             |                                                |

Unique `(venue_id, join_code)`, unique `(qr_token)`.

### nights

One operating session. The queue belongs to a night.

| Column                  | Type                               | Notes                                     |
| ----------------------- | ---------------------------------- | ----------------------------------------- |
| id                      | uuid PK                            |                                           |
| venue_id                | uuid                               | FK venues                                 |
| started_at              | timestamptz not null default now() |                                           |
| ended_at                | timestamptz null                   |                                           |
| status                  | text not null default 'open'       | check in (`open`, `closed`)               |
| rules_snapshot          | jsonb not null                     | Copy of `queue_rules.config` at open time |
| created_at / updated_at | timestamptz                        |                                           |

Constraint: at most one `open` night per venue (partial unique index, see Indexes).

### groups

| Column                  | Type                          | Notes                                   |
| ----------------------- | ----------------------------- | --------------------------------------- |
| id                      | uuid PK                       |                                         |
| venue_id                | uuid                          | FK venues                               |
| night_id                | uuid                          | FK nights                               |
| table_id                | uuid null                     | FK venue_tables; null = ad hoc group    |
| name                    | text not null                 | Defaults to table label or creator name |
| created_by              | uuid                          | FK profiles                             |
| is_active               | boolean not null default true |                                         |
| created_at / updated_at | timestamptz                   |                                         |

### group_members

| Column    | Type                               | Notes       |
| --------- | ---------------------------------- | ----------- |
| group_id  | uuid                               | FK groups   |
| user_id   | uuid                               | FK profiles |
| joined_at | timestamptz not null default now() |             |

PK `(group_id, user_id)`. No `updated_at`.

### songs

Venue catalog. Guests can only pick rows from their venue.

| Column                  | Type                          | Notes                                   |
| ----------------------- | ----------------------------- | --------------------------------------- |
| id                      | uuid PK                       |                                         |
| venue_id                | uuid                          | FK venues                               |
| title                   | text not null                 |                                         |
| artist                  | text not null                 |                                         |
| language                | text null                     | ISO 639-1 (`he`, `en`, ...) or null     |
| duration_sec            | int null                      |                                         |
| external_ref            | text null                     | VirtualDJ file path or id               |
| search                  | tsvector                      | Generated: `to_tsvector('simple', title |     | ' ' |     | artist)` |
| is_active               | boolean not null default true |                                         |
| created_at / updated_at | timestamptz                   |                                         |

Unique `(venue_id, title, artist)`.

### song_videos

YouTube karaoke versions of a song. One song can have several (different channels, keys, with or without guide vocals); the watch URL `https://www.youtube.com/watch?v=<youtube_id>` and the thumbnail `https://i.ytimg.com/vi/<youtube_id>/mqdefault.jpg` are derived in code.

| Column                  | Type                          | Notes                                                        |
| ----------------------- | ----------------------------- | ------------------------------------------------------------ |
| id                      | uuid PK                       |                                                              |
| venue_id                | uuid                          | FK venues (denormalized for RLS)                             |
| song_id                 | uuid                          | FK songs, cascade delete                                     |
| youtube_id              | text not null                 | 11-char video id, check constraint                           |
| label                   | text null                     | Shown as the version chip, e.g. `Sing King`, `קריוקי פסנתר`  |
| duration_sec            | int null                      | Of this version                                              |
| embeddable              | boolean not null default true | false when the channel disables embedding (link still works) |
| sort_order              | int not null default 0        | Display order; 0 is the default version                      |
| is_active               | boolean not null default true |                                                              |
| created_at / updated_at | timestamptz                   |                                                              |

Unique `(song_id, youtube_id)`. Index `(song_id, sort_order) where is_active`.

### song_requests

| Column       | Type                            | Notes                                                                                     |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| id           | uuid PK                         |                                                                                           |
| venue_id     | uuid                            | FK venues                                                                                 |
| night_id     | uuid                            | FK nights                                                                                 |
| song_id      | uuid                            | FK songs                                                                                  |
| requested_by | uuid                            | FK profiles                                                                               |
| group_id     | uuid null                       | FK groups                                                                                 |
| table_id     | uuid null                       | FK venue_tables                                                                           |
| singers      | text[] not null default '{}'    | Display names                                                                             |
| note         | text null                       | Max 200 chars                                                                             |
| status       | text not null default 'pending' | check in (`pending`, `approved`, `queued`, `now_singing`, `done`, `skipped`, `cancelled`) |
| priority     | int not null default 0          | Host-set; higher sorts earlier                                                            |
| created_at   | timestamptz                     |                                                                                           |
| updated_at   | timestamptz                     |                                                                                           |

Status lifecycle: `pending -> approved -> queued -> now_singing -> done`; `skipped` and `cancelled` are terminal from any non-terminal state. Without host approval, requests start at `queued`.

### queue_entries

| Column                  | Type                           | Notes                                              |
| ----------------------- | ------------------------------ | -------------------------------------------------- |
| id                      | uuid PK                        |                                                    |
| venue_id                | uuid                           | FK venues                                          |
| night_id                | uuid                           | FK nights                                          |
| request_id              | uuid unique not null           | FK song_requests                                   |
| position                | numeric not null               | Fractional rank; insert between a and b at (a+b)/2 |
| locked_by_host          | boolean not null default false | Pinned; `reorder()` does not move it               |
| started_at              | timestamptz null               | Set when `now_singing`                             |
| ended_at                | timestamptz null               | Set when `done` / `skipped`                        |
| created_at / updated_at | timestamptz                    |                                                    |

### queue_rules

| Column     | Type           | Notes                                        |
| ---------- | -------------- | -------------------------------------------- |
| venue_id   | uuid PK        | FK venues                                    |
| config     | jsonb not null | Schema in [QUEUE_RULES.md](./QUEUE_RULES.md) |
| updated_by | uuid null      | FK profiles                                  |
| updated_at | timestamptz    |                                              |

No `id`, no `created_at`.

### catalog_imports

| Column                  | Type                            | Notes                                                 |
| ----------------------- | ------------------------------- | ----------------------------------------------------- |
| id                      | uuid PK                         |                                                       |
| venue_id                | uuid                            | FK venues                                             |
| uploaded_by             | uuid                            | FK profiles                                           |
| storage_path            | text not null                   | `catalog-uploads/<venue_id>/<uuid>.<ext>`             |
| status                  | text not null default 'pending' | check in (`pending`, `processing`, `done`, `failed`)  |
| stats                   | jsonb not null default '{}'     | `{ inserted, updated, deactivated, skipped, errors }` |
| error                   | text null                       |                                                       |
| created_at / updated_at | timestamptz                     |                                                       |

## 2. Relationships

- `venues 1-n venue_members`, `venue_tables`, `nights`, `groups`, `songs`, `song_requests`, `queue_entries`, `catalog_imports`; `venues 1-1 queue_rules`.
- `profiles 1-n venue_members`, `group_members`, `song_requests (requested_by)`, `groups (created_by)`, `catalog_imports (uploaded_by)`.
- `nights 1-n groups`, `song_requests`, `queue_entries`.
- `venue_tables 1-n groups`, `song_requests (table_id)`.
- `groups 1-n group_members`, `song_requests`.
- `songs 1-n song_requests`.
- `song_requests 1-0..1 queue_entries`.

Cross-venue integrity: a trigger (or composite FK) asserts that `song_requests.song_id`, `night_id`, `group_id`, `table_id` all belong to the same `venue_id` as the request.

## 3. Indexes worth having

| Table           | Index                                                                                            | Purpose                                               |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| venue_members   | `(user_id)`                                                                                      | "my venues" lookup and RLS membership checks          |
| venue_tables    | unique `(venue_id, join_code)`, unique `(qr_token)`                                              | Join by code / QR                                     |
| nights          | partial unique `(venue_id) where status = 'open'`                                                | One open night per venue                              |
| groups          | unique `(night_id, table_id) where is_active and table_id is not null`                           | One group per table per night (`join_table`)          |
| group_members   | `(user_id)`                                                                                      | RLS: which groups/nights the user is in               |
| songs           | GIN `(search)`; `(venue_id, is_active)`; unique `(venue_id, title, artist)`                      | Full-text search, catalog listing, import upsert      |
| songs           | `(venue_id, lower(title) text_pattern_ops)`                                                      | Prefix matching fallback for short queries            |
| song_requests   | `(night_id, status)`; `(requested_by, night_id, status)`; `(night_id, song_id, created_at desc)` | Queue state, maxPending checks, duplicate-song window |
| queue_entries   | unique `(request_id)`; `(night_id, position)`                                                    | Ordered queue read                                    |
| catalog_imports | `(venue_id, created_at desc)`                                                                    | Import history                                        |

## 4. RLS policy summary

Helper functions (`security definer`, stable):

- `is_venue_staff(venue_id, roles text[])` - true if `auth.uid()` is in `venue_members` for the venue with one of the roles.
- `is_night_participant(night_id)` - true if `auth.uid()` is in `group_members` of an active group of that night and the night is `open`.
- `is_venue_participant(venue_id)` - true if the user participates in the venue's open night.
- `search_songs(venue_id, query, language, limit)` - callable by `anon`; prefix full-text match on `songs.search` plus a substring fallback, active songs of an active venue only, each row with its `song_videos` as a jsonb array. Empty query browses alphabetically. Backs guest catalog search (ADR-008).
- `resolve_table(code text, venue_id uuid default null)` - callable by `anon`; maps a `qr_token` (uuid) or `join_code` (uppercased) to `{table_id, table_label, join_code, venue_id, venue_name, venue_slug, night_id, night_open}` for an active table of an active venue, else no row. Join codes are unique per venue only: with `venue_id` the lookup is scoped to that venue; without it a typed code that exists in several venues yields no row (never an arbitrary venue). Backs the guest join flow before sign-in (ADR-008).
- `join_table(table_id)` - callable by `authenticated` (anonymous guests included, ADR-009); finds or creates the table's active group in the venue's open night, moves the caller into it (one table per guest per night) and returns the group id, or null when no night is open. Idempotent. The join action calls it; the guest loader reads `group_members` instead and calls it only when the guest is not yet in the cookie's table for the open night.
- `submit_request(night_id, song_id, singers, note, position)` - callable by `authenticated`; inserts `song_requests` and, unless `rules_snapshot.requireHostApproval` is set, `queue_entries` in one transaction. Re-checks every guest-facing rule of QUEUE_RULES.md section 3 against the night's `rules_snapshot` (per-user quota under a per-(night, user) advisory lock), derives `table_id`/`group_id` from the caller's membership, trims singers (40 characters each, at most 20 names, the web app's `SINGERS_HARD_MAX`) and the note, and never places the entry ahead of the current tail. Returns one row `{request_id, entry_id, status, reason}`; `reason` is any engine reason code or `NOT_PARTICIPANT`. The Server Action runs `evaluateRequest` first; the RPC makes a direct call unable to bypass the engine's answer.
- Trigger `song_requests_end_entry` - when a request becomes `done`, `skipped` or `cancelled`, sets `queue_entries.ended_at` (security definer, so a guest cancel through RLS closes its entry).

| Table           | select                                                                                                        | insert                                                                       | update                                                                         | delete                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| profiles        | own row; staff of a venue can read display_name/avatar of participants (view)                                 | trigger only                                                                 | own row                                                                        | -                                               |
| venues          | participants and staff of that venue; `is_active` venues by slug for the join page (limited columns via view) | service role                                                                 | owner/admin                                                                    | -                                               |
| venue_members   | staff of that venue                                                                                           | owner/admin                                                                  | owner/admin                                                                    | owner/admin (cannot remove last owner, trigger) |
| venue_tables    | participants (active rows) and staff; token lookup via RPC `resolve_table(qr_token or join_code)`             | owner/admin                                                                  | owner/admin                                                                    | owner/admin                                     |
| nights          | participants (open night) and staff                                                                           | dj/admin/owner                                                               | dj/admin/owner                                                                 | -                                               |
| groups          | participants of the night and staff                                                                           | authenticated user in the venue's open night (RPC `join_table`)              | creator or staff                                                               | -                                               |
| group_members   | members of the same group and staff                                                                           | self (RPC `join_table`)                                                      | -                                                                              | self (leave) or staff                           |
| songs           | participants and staff (`is_active` for guests)                                                               | owner/admin, service role                                                    | owner/admin, service role                                                      | owner/admin                                     |
| song_videos     | same as songs; anonymous search via RPC `search_songs`                                                        | owner/admin                                                                  | owner/admin                                                                    | owner/admin                                     |
| song_requests   | participants of the night and staff                                                                           | guest for self (`requested_by = auth.uid()`) via RPC `submit_request`; staff | guest: own row, only to `cancelled` from `pending/approved/queued`; staff: any | -                                               |
| queue_entries   | participants of the night and staff                                                                           | staff / RPC `submit_request`                                                 | staff / trigger `song_requests_end_entry`                                      | staff                                           |
| queue_rules     | staff                                                                                                         | owner/admin                                                                  | owner/admin                                                                    | -                                               |
| catalog_imports | owner/admin                                                                                                   | owner/admin                                                                  | service role                                                                   | -                                               |

Storage bucket `catalog-uploads`: owner/admin of the venue in the first path segment may insert/select; service role reads for processing.

Edge Functions and scheduled jobs use the service role key and bypass RLS; they must always filter by `venue_id` explicitly.

## 5. ER diagram

```mermaid
erDiagram
    profiles ||--o{ venue_members : "is staff"
    profiles ||--o{ group_members : "joins"
    profiles ||--o{ song_requests : "requests"
    profiles ||--o{ groups : "creates"
    profiles ||--o{ catalog_imports : "uploads"

    venues ||--o{ venue_members : ""
    venues ||--o{ venue_tables : ""
    venues ||--o{ nights : ""
    venues ||--o{ groups : ""
    venues ||--o{ songs : ""
    venues ||--o{ song_requests : ""
    venues ||--o{ queue_entries : ""
    venues ||--o{ catalog_imports : ""
    venues ||--|| queue_rules : ""

    nights ||--o{ groups : ""
    nights ||--o{ song_requests : ""
    nights ||--o{ queue_entries : ""

    venue_tables ||--o{ groups : "seats"
    venue_tables ||--o{ song_requests : ""

    groups ||--o{ group_members : ""
    groups ||--o{ song_requests : ""

    songs ||--o{ song_requests : ""
    song_requests ||--o| queue_entries : ""

    profiles {
        uuid id PK
        text display_name
        text avatar_url
        text phone
        text locale
    }
    venues {
        uuid id PK
        text slug UK
        text name
        text timezone
        text default_locale
        jsonb settings
        boolean is_active
    }
    venue_members {
        uuid venue_id PK
        uuid user_id PK
        text role
    }
    venue_tables {
        uuid id PK
        uuid venue_id FK
        text label
        text join_code
        uuid qr_token UK
        boolean is_active
    }
    nights {
        uuid id PK
        uuid venue_id FK
        timestamptz started_at
        timestamptz ended_at
        text status
        jsonb rules_snapshot
    }
    groups {
        uuid id PK
        uuid venue_id FK
        uuid night_id FK
        uuid table_id FK
        text name
        uuid created_by FK
        boolean is_active
    }
    group_members {
        uuid group_id PK
        uuid user_id PK
        timestamptz joined_at
    }
    songs {
        uuid id PK
        uuid venue_id FK
        text title
        text artist
        text language
        int duration_sec
        text external_ref
        tsvector search
        boolean is_active
    }
    song_requests {
        uuid id PK
        uuid venue_id FK
        uuid night_id FK
        uuid song_id FK
        uuid requested_by FK
        uuid group_id FK
        uuid table_id FK
        text[] singers
        text note
        text status
        int priority
    }
    queue_entries {
        uuid id PK
        uuid venue_id FK
        uuid night_id FK
        uuid request_id FK
        numeric position
        boolean locked_by_host
        timestamptz started_at
        timestamptz ended_at
    }
    queue_rules {
        uuid venue_id PK
        jsonb config
        uuid updated_by FK
        timestamptz updated_at
    }
    catalog_imports {
        uuid id PK
        uuid venue_id FK
        uuid uploaded_by FK
        text storage_path
        text status
        jsonb stats
        text error
    }
```
