-- Phase 2, slice 1: table join flow, groups and night control.
--
-- * groups.kind distinguishes the automatic per-table group from ad hoc groups.
-- * join codes become globally unique so the manual "enter code" page needs no venue.
-- * RPCs (security definer) replace direct inserts into groups / group_members so the
--   server enforces "one group per guest per night" and "one table group per table".
-- * Tenant isolation: signed-in users no longer see every venue, table and open night;
--   they see the venue they participate in (or staff of). Code lookup goes through
--   resolve_table(), which only returns the venue name and table label.
-- * The self-referencing group_members policy is replaced by a security definer helper
--   (a policy that queries its own table raises "infinite recursion" at runtime).
-- * group_members is added to the realtime publication.

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------
create type public.group_kind as enum ('table', 'adhoc');

alter table public.groups
  add column kind public.group_kind not null default 'adhoc';

-- Exactly one active table group per table per night.
create unique index groups_one_table_group_per_night
  on public.groups (night_id, table_id)
  where kind = 'table' and is_active;

-- Join codes are typed without venue context, so they must be unique across venues.
create unique index venue_tables_join_code_unique on public.venue_tables (join_code);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

-- True when the user is in an active group of the venue's open night.
create or replace function public.is_venue_participant(p_venue_id uuid)
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
    join public.nights n on n.id = g.night_id
    where g.venue_id = p_venue_id
      and g.is_active
      and n.status = 'open'
      and gm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_venue_participant(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_venue_participant(uuid) to authenticated;

-- Internal: make p_user a member of p_group and of no other group in that night.
create or replace function public.set_user_group(p_user_id uuid, p_night_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_members gm
  using public.groups g
  where g.id = gm.group_id
    and g.night_id = p_night_id
    and gm.user_id = p_user_id
    and gm.group_id <> p_group_id;

  insert into public.group_members (group_id, user_id)
  values (p_group_id, p_user_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.set_user_group(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- RPC: resolve a QR token or join code to venue + table (+ open night, if any).
-- Callable before sign-in so the join page can say "Join T3 at Demo Bar".
-- ---------------------------------------------------------------------------
create or replace function public.resolve_table(p_code text)
returns table (
  venue_id uuid,
  venue_name text,
  venue_slug text,
  table_id uuid,
  table_label text,
  night_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.name, v.slug, t.id, t.label, n.id
  from public.venue_tables t
  join public.venues v on v.id = t.venue_id and v.is_active
  left join public.nights n on n.venue_id = v.id and n.status = 'open'
  where t.is_active
    and (
      t.qr_token = case
        when p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then p_code::uuid
        else null
      end
      or t.join_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'))
    )
  limit 1;
$$;

revoke all on function public.resolve_table(text) from public;
grant execute on function public.resolve_table(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: join a table. Joins the table's active group for the open night, creating it
-- (named after the table) when missing. Leaves any other group in that night.
-- status: 'joined' | 'not_found' | 'no_open_night'
-- ---------------------------------------------------------------------------
create or replace function public.join_table(p_code text)
returns table (
  status text,
  venue_id uuid,
  venue_name text,
  table_id uuid,
  table_label text,
  night_id uuid,
  group_id uuid,
  group_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_group_id uuid;
  v_group_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into r from public.resolve_table(p_code);
  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::uuid, null::text,
                        null::uuid, null::uuid, null::text;
    return;
  end if;
  if r.night_id is null then
    return query select 'no_open_night'::text, r.venue_id, r.venue_name, r.table_id,
                        r.table_label, null::uuid, null::uuid, null::text;
    return;
  end if;

  -- Serialize per table so two guests scanning at once create one group.
  perform 1 from public.venue_tables t where t.id = r.table_id for update;

  select g.id, g.name into v_group_id, v_group_name
  from public.groups g
  where g.night_id = r.night_id and g.table_id = r.table_id and g.kind = 'table' and g.is_active
  limit 1;

  if v_group_id is null then
    insert into public.groups (venue_id, night_id, table_id, name, created_by, kind)
    values (r.venue_id, r.night_id, r.table_id, r.table_label, v_uid, 'table')
    returning id, name into v_group_id, v_group_name;
  end if;

  perform public.set_user_group(v_uid, r.night_id, v_group_id);

  return query select 'joined'::text, r.venue_id, r.venue_name, r.table_id, r.table_label,
                      r.night_id, v_group_id, v_group_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create an ad hoc group. The caller must already participate in the venue's open
-- night (p_table_id null = use the caller's current night). Moves the caller into it.
-- status: 'created' | 'invalid_name' | 'no_open_night' | 'not_participant'
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_table_id uuid default null)
returns table (status text, group_id uuid, group_name text, night_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_venue_id uuid;
  v_night_id uuid;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if length(v_name) < 1 or length(v_name) > 40 then
    return query select 'invalid_name'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  if p_table_id is not null then
    select t.venue_id into v_venue_id from public.venue_tables t where t.id = p_table_id and t.is_active;
    if v_venue_id is null then
      return query select 'not_participant'::text, null::uuid, null::text, null::uuid;
      return;
    end if;
    select n.id into v_night_id from public.nights n where n.venue_id = v_venue_id and n.status = 'open';
  else
    select n.id, n.venue_id into v_night_id, v_venue_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    join public.nights n on n.id = g.night_id
    where gm.user_id = v_uid and g.is_active and n.status = 'open'
    order by n.started_at desc
    limit 1;
  end if;

  if v_night_id is null then
    return query select 'no_open_night'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  if not public.is_venue_participant(v_venue_id) then
    return query select 'not_participant'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  insert into public.groups (venue_id, night_id, table_id, name, created_by, kind)
  values (v_venue_id, v_night_id, p_table_id, v_name, v_uid, 'adhoc')
  returning id into v_group_id;

  perform public.set_user_group(v_uid, v_night_id, v_group_id);

  return query select 'created'::text, v_group_id, v_name, v_night_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: join a group by its id (from a shared invite link).
-- status: 'joined' | 'not_found'
-- ---------------------------------------------------------------------------
create or replace function public.join_group(p_group_id uuid)
returns table (
  status text,
  venue_id uuid,
  venue_name text,
  table_id uuid,
  table_label text,
  night_id uuid,
  group_id uuid,
  group_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select g.id, g.name, g.night_id, g.table_id, v.id as venue_id, v.name as venue_name, t.label
    into r
  from public.groups g
  join public.nights n on n.id = g.night_id and n.status = 'open'
  join public.venues v on v.id = g.venue_id and v.is_active
  left join public.venue_tables t on t.id = g.table_id
  where g.id = p_group_id and g.is_active;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::uuid, null::text,
                        null::uuid, null::uuid, null::text;
    return;
  end if;

  perform public.set_user_group(v_uid, r.night_id, r.id);

  return query select 'joined'::text, r.venue_id, r.venue_name, r.table_id, r.label,
                      r.night_id, r.id, r.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: night control for staff. open_night is idempotent: it returns the already open
-- night when there is one. close_night only affects an open night.
-- ---------------------------------------------------------------------------
create or replace function public.open_night(p_venue_id uuid)
returns setof public.nights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night_id uuid;
begin
  if not public.is_venue_staff(p_venue_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select n.id into v_night_id from public.nights n where n.venue_id = p_venue_id and n.status = 'open';
  if v_night_id is null then
    begin
      insert into public.nights (venue_id, rules_snapshot)
      values (
        p_venue_id,
        coalesce((select qr.config from public.queue_rules qr where qr.venue_id = p_venue_id), '{}'::jsonb)
      )
      returning id into v_night_id;
    exception when unique_violation then
      -- Someone opened it concurrently; fall through and return that one.
      select n.id into v_night_id from public.nights n where n.venue_id = p_venue_id and n.status = 'open';
    end;
  end if;

  return query select * from public.nights n where n.id = v_night_id;
end;
$$;

create or replace function public.close_night(p_night_id uuid)
returns setof public.nights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id uuid;
begin
  select n.venue_id into v_venue_id from public.nights n where n.id = p_night_id;
  if v_venue_id is null or not public.is_venue_staff(v_venue_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.nights n
  set status = 'closed', ended_at = now()
  where n.id = p_night_id and n.status = 'open';

  return query select * from public.nights n where n.id = p_night_id;
end;
$$;

revoke all on function public.join_table(text) from public;
revoke all on function public.create_group(text, uuid) from public;
revoke all on function public.join_group(uuid) from public;
revoke all on function public.open_night(uuid) from public;
revoke all on function public.close_night(uuid) from public;
grant execute on function public.join_table(text) to authenticated;
grant execute on function public.create_group(text, uuid) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.open_night(uuid) to authenticated;
grant execute on function public.close_night(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: tighten tenant isolation; move writes behind the RPCs above.
-- ---------------------------------------------------------------------------
drop policy "venues: read active" on public.venues;
create policy "venues: participants or staff read" on public.venues
  for select to authenticated using (
    public.is_venue_staff(id) or (is_active and public.is_venue_participant(id))
  );

drop policy "venue_tables: read active" on public.venue_tables;
create policy "venue_tables: participants or staff read" on public.venue_tables
  for select to authenticated using (
    public.is_venue_staff(venue_id) or (is_active and public.is_venue_participant(venue_id))
  );

drop policy "nights: read open or staff" on public.nights;
create policy "nights: participants or staff read" on public.nights
  for select to authenticated using (
    public.is_venue_staff(venue_id) or public.is_night_participant(id)
  );

-- groups are created through join_table / create_group only.
drop policy "groups: create in open night" on public.groups;

-- group_members: membership changes through RPCs; leaving stays a direct delete.
drop policy "group_members: join self" on public.group_members;
drop policy "group_members: read" on public.group_members;
create policy "group_members: read" on public.group_members
  for select to authenticated using (
    public.is_group_member(group_id)
    or exists (
      select 1 from public.groups g where g.id = group_members.group_id and public.is_venue_staff(g.venue_id)
    )
  );

-- profiles: members of the same group see each other's name and avatar.
create policy "profiles: group peers read" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.group_members gm
      where gm.user_id = profiles.id and public.is_group_member(gm.group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: the guest home subscribes to its group's member list.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.group_members;

-- down: drop the five RPCs and three helpers; drop policies added here and recreate the
-- phase 1 versions ("venues: read active", "venue_tables: read active", "nights: read open
-- or staff", "groups: create in open night", "group_members: join self", old
-- "group_members: read"); drop "profiles: group peers read"; remove group_members from
-- supabase_realtime; drop index venue_tables_join_code_unique and
-- groups_one_table_group_per_night; drop column groups.kind and type group_kind.
