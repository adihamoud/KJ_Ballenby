-- KJ Ballenby: initial schema.
-- Multi-venue karaoke queue. Every tenant row carries venue_id and is protected by RLS.

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.venue_role as enum ('owner', 'admin', 'dj');
create type public.night_status as enum ('open', 'closed');
create type public.request_status as enum (
  'pending', 'approved', 'queued', 'now_singing', 'done', 'skipped', 'cancelled'
);
create type public.import_status as enum ('pending', 'processing', 'done', 'failed');
create type public.app_locale as enum ('he', 'en');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Short, human-friendly join code for tables (no ambiguous characters).
create or replace function public.generate_join_code(len int default 5)
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  phone text,
  locale public.app_locale not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  timezone text not null default 'Asia/Jerusalem',
  default_locale public.app_locale not null default 'he',
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venue_members (
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.venue_role not null,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create index venue_members_user_idx on public.venue_members (user_id);

create table public.venue_tables (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  label text not null,
  join_code text not null default public.generate_join_code(),
  qr_token uuid not null default gen_random_uuid() unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, label),
  unique (venue_id, join_code)
);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  closes_at timestamptz,
  status public.night_status not null default 'open',
  rules_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nights_venue_status_idx on public.nights (venue_id, status);
-- Only one open night per venue at a time.
create unique index nights_one_open_per_venue on public.nights (venue_id) where status = 'open';

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  night_id uuid not null references public.nights (id) on delete cascade,
  table_id uuid references public.venue_tables (id) on delete set null,
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_night_idx on public.groups (night_id);
create index groups_table_idx on public.groups (table_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  title text not null,
  artist text not null,
  language text,
  duration_sec int check (duration_sec is null or duration_sec > 0),
  external_ref text,
  is_active boolean not null default true,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, title, artist)
);
create index songs_venue_idx on public.songs (venue_id) where is_active;
create index songs_search_idx on public.songs using gin (search);

create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  night_id uuid not null references public.nights (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  table_id uuid references public.venue_tables (id) on delete set null,
  singers text[] not null default '{}',
  note text,
  status public.request_status not null default 'pending',
  priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index song_requests_night_status_idx on public.song_requests (night_id, status);
create index song_requests_user_idx on public.song_requests (requested_by, night_id);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  night_id uuid not null references public.nights (id) on delete cascade,
  request_id uuid not null unique references public.song_requests (id) on delete cascade,
  position numeric not null,
  locked_by_host boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index queue_entries_night_position_idx on public.queue_entries (night_id, position);

create table public.queue_rules (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  status public.import_status not null default 'pending',
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_imports_venue_idx on public.catalog_imports (venue_id, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'venues', 'venue_tables', 'nights', 'groups', 'songs',
    'song_requests', 'queue_entries', 'catalog_imports'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile auto-creation on sign-up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      null
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Authorization helpers (security definer so they can read membership under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_venue_staff(p_venue_id uuid, p_roles public.venue_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id
      and vm.user_id = auth.uid()
      and (p_roles is null or vm.role = any (p_roles))
  );
$$;

create or replace function public.is_night_participant(p_night_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where g.night_id = p_night_id
      and gm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_venue_staff(uuid, public.venue_role[]) from public;
revoke all on function public.is_night_participant(uuid) from public;
grant execute on function public.is_venue_staff(uuid, public.venue_role[]) to authenticated;
grant execute on function public.is_night_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.venue_members enable row level security;
alter table public.venue_tables enable row level security;
alter table public.nights enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.songs enable row level security;
alter table public.song_requests enable row level security;
alter table public.queue_entries enable row level security;
alter table public.queue_rules enable row level security;
alter table public.catalog_imports enable row level security;

-- profiles: you see yourself; staff see members of their venue's nights (via groups).
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: staff read participants" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.user_id = profiles.id and public.is_venue_staff(g.venue_id)
    )
  );

-- venues: anyone signed in can read active venues (needed to join by QR); staff manage.
create policy "venues: read active" on public.venues
  for select to authenticated using (is_active or public.is_venue_staff(id));
create policy "venues: owner/admin update" on public.venues
  for update to authenticated
  using (public.is_venue_staff(id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(id, array['owner', 'admin']::public.venue_role[]));

-- venue_members: staff see their venue's staff; owners manage.
create policy "venue_members: staff read" on public.venue_members
  for select to authenticated using (public.is_venue_staff(venue_id));
create policy "venue_members: owner manage" on public.venue_members
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner']::public.venue_role[]));

-- venue_tables: readable by signed-in users (QR join resolves qr_token); owner/admin manage.
create policy "venue_tables: read active" on public.venue_tables
  for select to authenticated using (is_active or public.is_venue_staff(venue_id));
create policy "venue_tables: owner/admin manage" on public.venue_tables
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]));

-- nights: open nights readable by signed-in users (to join); staff manage.
create policy "nights: read open or staff" on public.nights
  for select to authenticated using (status = 'open' or public.is_venue_staff(venue_id));
create policy "nights: staff manage" on public.nights
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

-- groups: participants of the night and staff can read; any signed-in user can create a group
-- in an open night; creator or staff update.
create policy "groups: read" on public.groups
  for select to authenticated using (
    public.is_night_participant(night_id) or public.is_venue_staff(venue_id)
  );
create policy "groups: create in open night" on public.groups
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.nights n where n.id = night_id and n.status = 'open' and n.venue_id = groups.venue_id)
  );
create policy "groups: creator or staff update" on public.groups
  for update to authenticated
  using (created_by = auth.uid() or public.is_venue_staff(venue_id))
  with check (created_by = auth.uid() or public.is_venue_staff(venue_id));

-- group_members: members of the same group and staff read; users join/leave themselves.
create policy "group_members: read" on public.group_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members me where me.group_id = group_members.group_id and me.user_id = auth.uid()
    )
    or exists (
      select 1 from public.groups g where g.id = group_members.group_id and public.is_venue_staff(g.venue_id)
    )
  );
create policy "group_members: join self" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "group_members: leave self or staff" on public.group_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g where g.id = group_members.group_id and public.is_venue_staff(g.venue_id)
    )
  );

-- songs: readable by anyone signed in (catalog browsing); owner/admin manage.
create policy "songs: read active" on public.songs
  for select to authenticated using (is_active or public.is_venue_staff(venue_id));
create policy "songs: owner/admin manage" on public.songs
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]));

-- song_requests: participants read the night's requests; users create their own and cancel
-- while pending; staff manage everything.
create policy "song_requests: read" on public.song_requests
  for select to authenticated using (
    public.is_night_participant(night_id) or public.is_venue_staff(venue_id)
  );
create policy "song_requests: create own" on public.song_requests
  for insert to authenticated with check (
    requested_by = auth.uid() and public.is_night_participant(night_id)
  );
create policy "song_requests: cancel own pending" on public.song_requests
  for update to authenticated
  using (requested_by = auth.uid() and status in ('pending', 'approved', 'queued'))
  with check (requested_by = auth.uid() and status = 'cancelled');
create policy "song_requests: staff manage" on public.song_requests
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

-- queue_entries: participants read; only staff (and server functions) write.
create policy "queue_entries: read" on public.queue_entries
  for select to authenticated using (
    public.is_night_participant(night_id) or public.is_venue_staff(venue_id)
  );
create policy "queue_entries: staff manage" on public.queue_entries
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

-- queue_rules: staff read; owner/admin write.
create policy "queue_rules: staff read" on public.queue_rules
  for select to authenticated using (public.is_venue_staff(venue_id));
create policy "queue_rules: owner/admin manage" on public.queue_rules
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]));

-- catalog_imports: owner/admin only.
create policy "catalog_imports: owner/admin manage" on public.catalog_imports
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]));

-- ---------------------------------------------------------------------------
-- Realtime: guests and the DJ dashboard subscribe to these.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.queue_entries;
alter publication supabase_realtime add table public.song_requests;
alter publication supabase_realtime add table public.nights;

-- ---------------------------------------------------------------------------
-- Storage bucket for catalog uploads (private; owner/admin upload, service role reads).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-imports', 'catalog-imports', false, 26214400,
  array['text/csv', 'text/plain', 'application/xml', 'text/xml', 'application/vnd.ms-excel']
)
on conflict (id) do nothing;

create policy "catalog-imports: owner/admin upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'catalog-imports'
    and public.is_venue_staff(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.venue_role[]
    )
  );
create policy "catalog-imports: owner/admin read" on storage.objects
  for select to authenticated using (
    bucket_id = 'catalog-imports'
    and public.is_venue_staff(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.venue_role[]
    )
  );
