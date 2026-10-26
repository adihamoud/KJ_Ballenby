-- Fix H1 (pentest 2026-10-26): join_table trusted a bare table id.
--
-- join_table(p_table_id) seated the caller at any active table of any venue with an open night,
-- asking for no proof that they had scanned the QR or been given the code. Combined with
-- venue_table_labels (which returned every table id to any authenticated user) and the venues
-- read policy, any anonymous user could join any venue's night, spam its queue and read other
-- guests' requests. The direct-insert holes were closed on 2026-10-24, but join_table itself
-- was never given a check.
--
-- 1. join_table now takes the same proof the guest used to get in: the QR token (uuid, globally
--    unique) or the per-venue join code together with the venue id. It resolves the table from
--    that proof exactly like resolve_table, so there is no client-supplied table id to trust.
-- 2. venue_table_labels (labels only, used by the guest loader to name tables on the queue) is
--    scoped to staff and to participants of the venue's open night, instead of every
--    authenticated user of every venue.

-- ---------------------------------------------------------------------------
-- 1. join_table(code, venue_id) -> group id (null when the venue has no open night)
-- ---------------------------------------------------------------------------
drop function if exists public.join_table(uuid);

create or replace function public.join_table(p_code text, p_venue_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
  v_table public.venue_tables%rowtype;
  v_night_id uuid;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'join_table: not signed in' using errcode = '42501';
  end if;

  -- Same input shape as resolve_table: a uuid is a QR token (globally unique); anything else is a
  -- typed join code, which is unique per venue only and so requires p_venue_id. Without proof that
  -- resolves to a table, the caller is not seated.
  v_token := case
    when trim(coalesce(p_code, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then trim(p_code)::uuid
  end;

  select t.* into v_table
  from public.venue_tables t
  join public.venues v on v.id = t.venue_id
  where t.is_active
    and v.is_active
    and (
      (v_token is not null and t.qr_token = v_token)
      or (v_token is null and p_venue_id is not null
          and t.venue_id = p_venue_id
          and t.join_code = upper(trim(p_code)))
    )
  limit 1;
  if not found then
    return null;
  end if;

  select n.id into v_night_id
  from public.nights n
  where n.venue_id = v_table.venue_id and n.status = 'open';
  if v_night_id is null then
    return null;
  end if;

  -- Anonymous users get a profile from the auth trigger; make sure it exists anyway.
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  -- Serialize group creation per (night, table) so two guests scanning at once share one group.
  perform pg_advisory_xact_lock(hashtext(v_night_id::text), hashtext(v_table.id::text));

  select g.id into v_group_id
  from public.groups g
  where g.night_id = v_night_id and g.table_id = v_table.id and g.is_active
  order by g.created_at
  limit 1;

  if v_group_id is null then
    insert into public.groups (venue_id, night_id, table_id, name, created_by)
    values (v_table.venue_id, v_night_id, v_table.id, v_table.label, v_uid)
    returning id into v_group_id;
  end if;

  -- A guest sits at one table per night: switching tables moves them.
  delete from public.group_members gm
  using public.groups g
  where gm.group_id = g.id
    and gm.user_id = v_uid
    and g.night_id = v_night_id
    and g.id <> v_group_id;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, v_uid)
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

revoke all on function public.join_table(text, uuid) from public;
grant execute on function public.join_table(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. venue_table_labels: staff and open-night participants only
-- ---------------------------------------------------------------------------
-- Labels are shown next to queue items, so a participant needs every table's label for the night;
-- codes and QR tokens stay staff-only on venue_tables itself. A caller who is neither staff nor a
-- participant of the venue's open night gets no rows.
create or replace function public.venue_table_labels(p_venue_id uuid)
returns table (id uuid, label text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.label
  from public.venue_tables t
  join public.venues v on v.id = t.venue_id
  where t.venue_id = p_venue_id
    and v.is_active
    and (
      public.is_venue_staff(p_venue_id)
      or exists (
        select 1 from public.nights n
        where n.venue_id = p_venue_id
          and n.status = 'open'
          and public.is_night_participant(n.id)
      )
    )
  order by t.label;
$$;

revoke all on function public.venue_table_labels(uuid) from public;
grant execute on function public.venue_table_labels(uuid) to authenticated;

-- down: recreate join_table(uuid) from 20261024120000 (the p_table_id version) and the
--       all-authenticated venue_table_labels from 20261024170000; drop join_table(text, uuid).
