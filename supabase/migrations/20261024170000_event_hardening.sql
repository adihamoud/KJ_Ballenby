-- Hardening after the staged event of 2026-10-24 (eight agent teams, RLS probes with guest JWTs).
--
-- 1. Guests could INSERT into song_requests directly, bypassing every rule submit_request
--    enforces (quota, duplicate window, caps) and choosing their own priority/status.
--    Requests are created only by submit_request (security definer): the guest insert policy goes.
-- 2. Guests could INSERT themselves into any group (table spoofing) and create groups; the
--    group's creator (the first guest to scan) could update it. join_table is the only writer.
-- 3. A guest cancel could rewrite priority, singers, note and song in the same UPDATE. A trigger
--    now keeps every column but status/updated_at for non-staff updates.
-- 4. Any signed-in user could read qr_token and join_code of every active table of every venue.
--    venue_tables becomes staff-only; guests get labels through venue_table_labels().
-- 5. submit_request accepted singer names made only of tabs/newlines (trim() strips spaces
--    only), storing a blank singer. Whitespace is now collapsed before the empty check.

-- ---------------------------------------------------------------------------
-- 1 + 2: guests never write these tables directly
-- ---------------------------------------------------------------------------
drop policy if exists "song_requests: create own" on public.song_requests;
drop policy if exists "group_members: join self" on public.group_members;
drop policy if exists "groups: create in open night" on public.groups;
drop policy if exists "groups: creator or staff update" on public.groups;
create policy "groups: staff update" on public.groups
  for update to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

-- ---------------------------------------------------------------------------
-- 3: a guest update may only change status (the cancel) and updated_at
-- ---------------------------------------------------------------------------
create or replace function public.guard_song_request_guest_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_venue_staff(old.venue_id) then
    return new;
  end if;
  new.venue_id := old.venue_id;
  new.night_id := old.night_id;
  new.song_id := old.song_id;
  new.requested_by := old.requested_by;
  new.group_id := old.group_id;
  new.table_id := old.table_id;
  new.singers := old.singers;
  new.note := old.note;
  new.priority := old.priority;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists song_requests_guard_guest_update on public.song_requests;
create trigger song_requests_guard_guest_update
  before update on public.song_requests
  for each row execute function public.guard_song_request_guest_update();

-- ---------------------------------------------------------------------------
-- 4: table codes and QR tokens are staff-only; guests read labels via a function
-- ---------------------------------------------------------------------------
drop policy if exists "venue_tables: read active" on public.venue_tables;
create policy "venue_tables: staff read" on public.venue_tables
  for select to authenticated using (public.is_venue_staff(venue_id));

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
  order by t.label;
$$;

revoke all on function public.venue_table_labels(uuid) from public;
grant execute on function public.venue_table_labels(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5: submit_request singer sanitising. Full body repeated; only the singers block changed.
-- ---------------------------------------------------------------------------
create or replace function public.submit_request(
  p_night_id uuid,
  p_song_id uuid,
  p_singers text[],
  p_note text default null,
  p_position numeric default null
)
returns table (
  request_id uuid,
  entry_id uuid,
  status public.request_status,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_night public.nights%rowtype;
  v_song public.songs%rowtype;
  v_group public.groups%rowtype;
  v_rules jsonb;
  v_max_pending int := 1;
  v_max_pending_table int := null;
  v_cooldown_minutes int := 0;
  v_require_approval boolean := false;
  v_allow_duets boolean := true;
  v_max_singers int := 4;
  v_duplicate_minutes int := 60;
  v_cutoff_minutes int := null;
  v_last_ended timestamptz;
  v_open int;
  v_singers text[];
  v_note text;
  v_status public.request_status;
  v_tail numeric;
  v_position numeric;
  v_request_id uuid;
  v_entry_id uuid;
begin
  if v_uid is null then
    raise exception 'submit_request: not signed in' using errcode = '42501';
  end if;

  select n.* into v_night from public.nights n where n.id = p_night_id;
  if not found or v_night.status <> 'open' then
    return query select null::uuid, null::uuid, null::public.request_status, 'NIGHT_CLOSED'::text;
    return;
  end if;

  -- Rules from the night's snapshot; anything missing or malformed falls back to the engine default.
  v_rules := coalesce(v_night.rules_snapshot, '{}'::jsonb);
  if jsonb_typeof(v_rules -> 'maxPendingPerUser') = 'number' then
    v_max_pending := greatest((v_rules ->> 'maxPendingPerUser')::numeric::int, 1);
  end if;
  if jsonb_typeof(v_rules -> 'maxPendingPerTable') = 'number' then
    v_max_pending_table := greatest((v_rules ->> 'maxPendingPerTable')::numeric::int, 1);
  end if;
  if jsonb_typeof(v_rules -> 'cooldownMinutesPerUser') = 'number' then
    v_cooldown_minutes := greatest((v_rules ->> 'cooldownMinutesPerUser')::numeric::int, 0);
  end if;
  if jsonb_typeof(v_rules -> 'requireHostApproval') = 'boolean' then
    v_require_approval := (v_rules ->> 'requireHostApproval')::boolean;
  end if;
  if jsonb_typeof(v_rules -> 'allowDuets') = 'boolean' then
    v_allow_duets := (v_rules ->> 'allowDuets')::boolean;
  end if;
  if jsonb_typeof(v_rules -> 'maxSingersPerSong') = 'number' then
    v_max_singers := greatest((v_rules ->> 'maxSingersPerSong')::numeric::int, 1);
  end if;
  if jsonb_typeof(v_rules -> 'duplicateSongWindowMinutes') = 'number' then
    v_duplicate_minutes := greatest((v_rules ->> 'duplicateSongWindowMinutes')::numeric::int, 0);
  end if;
  if jsonb_typeof(v_rules -> 'nightCutoffMinutesBeforeClose') = 'number' then
    v_cutoff_minutes := greatest((v_rules ->> 'nightCutoffMinutesBeforeClose')::numeric::int, 0);
  end if;

  if v_cutoff_minutes is not null and v_night.closes_at is not null
     and now() >= v_night.closes_at - make_interval(mins => v_cutoff_minutes) then
    return query select null::uuid, null::uuid, null::public.request_status, 'CUTOFF'::text;
    return;
  end if;

  select g.* into v_group
  from public.groups g
  join public.group_members gm on gm.group_id = g.id
  where g.night_id = p_night_id and g.is_active and gm.user_id = v_uid
  order by gm.joined_at desc
  limit 1;
  if not found then
    return query select null::uuid, null::uuid, null::public.request_status, 'NOT_PARTICIPANT'::text;
    return;
  end if;

  select s.* into v_song
  from public.songs s
  where s.id = p_song_id and s.venue_id = v_night.venue_id;
  if not found or not v_song.is_active then
    return query select null::uuid, null::uuid, null::public.request_status, 'SONG_INACTIVE'::text;
    return;
  end if;

  -- Collapse every whitespace run first (trim() alone strips only U+0020, so a name made of
  -- tabs or newlines used to pass), then drop empties and cap length (40) and count (20).
  select coalesce(array_agg(q.singer), '{}'::text[]) into v_singers
  from (
    select left(q0.singer, 40) as singer
    from (
      select btrim(regexp_replace(x, '\s+', ' ', 'g')) as singer
      from unnest(coalesce(p_singers, '{}'::text[])) as x
    ) as q0
    where q0.singer <> ''
    limit 20
  ) as q;
  if cardinality(v_singers) = 0 then
    return query select null::uuid, null::uuid, null::public.request_status, 'TOO_MANY_SINGERS'::text;
    return;
  end if;
  if cardinality(v_singers) > 1 and not v_allow_duets then
    return query select null::uuid, null::uuid, null::public.request_status, 'DUETS_DISABLED'::text;
    return;
  end if;
  if cardinality(v_singers) > v_max_singers then
    return query select null::uuid, null::uuid, null::public.request_status, 'TOO_MANY_SINGERS'::text;
    return;
  end if;
  v_note := nullif(left(trim(coalesce(p_note, '')), 200), '');

  -- One submit at a time per (night, user): a double tap cannot slip past maxPendingPerUser.
  perform pg_advisory_xact_lock(hashtext(p_night_id::text), hashtext(v_uid::text));

  select count(*) into v_open
  from public.song_requests r
  where r.night_id = p_night_id
    and r.requested_by = v_uid
    and r.status in ('pending', 'approved', 'queued', 'now_singing');
  if v_open >= v_max_pending then
    return query select null::uuid, null::uuid, null::public.request_status, 'MAX_PENDING_USER'::text;
    return;
  end if;

  if v_max_pending_table is not null and v_group.table_id is not null then
    select count(*) into v_open
    from public.song_requests r
    where r.night_id = p_night_id
      and r.table_id = v_group.table_id
      and r.status in ('pending', 'approved', 'queued', 'now_singing');
    if v_open >= v_max_pending_table then
      return query select null::uuid, null::uuid, null::public.request_status, 'MAX_PENDING_TABLE'::text;
      return;
    end if;
  end if;

  -- Cooldown counts from when the user's last song finished (skips do not count as sung).
  if v_cooldown_minutes > 0 then
    select max(coalesce(e.ended_at, r.updated_at)) into v_last_ended
    from public.song_requests r
    left join public.queue_entries e on e.request_id = r.id
    where r.night_id = p_night_id and r.requested_by = v_uid and r.status = 'done';
    if v_last_ended is not null
       and now() < v_last_ended + make_interval(mins => v_cooldown_minutes) then
      return query select null::uuid, null::uuid, null::public.request_status, 'COOLDOWN'::text;
      return;
    end if;
  end if;

  -- Duplicate window: the song may not be waiting, on the mic, or finished within the window.
  if v_duplicate_minutes > 0 then
    if exists (
      select 1 from public.song_requests r
      where r.night_id = p_night_id and r.song_id = p_song_id
        and r.status in ('pending', 'approved', 'queued', 'now_singing')
    ) then
      return query select null::uuid, null::uuid, null::public.request_status, 'DUPLICATE_SONG'::text;
      return;
    end if;
    select max(coalesce(e.ended_at, r.updated_at)) into v_last_ended
    from public.song_requests r
    left join public.queue_entries e on e.request_id = r.id
    where r.night_id = p_night_id and r.song_id = p_song_id and r.status = 'done';
    if v_last_ended is not null
       and now() < v_last_ended + make_interval(mins => v_duplicate_minutes) then
      return query select null::uuid, null::uuid, null::public.request_status, 'DUPLICATE_SONG'::text;
      return;
    end if;
  end if;

  v_status := case when v_require_approval then 'pending' else 'queued' end;

  insert into public.song_requests
    (venue_id, night_id, song_id, requested_by, group_id, table_id, singers, note, status)
  values
    (v_night.venue_id, p_night_id, p_song_id, v_uid, v_group.id, v_group.table_id, v_singers, v_note, v_status)
  returning id into v_request_id;

  if v_status = 'queued' then
    -- Same formula as the engine's tailPosition (POSITION_STEP = 1000). A caller may pass the
    -- engine's position but can never land ahead of the current tail.
    select coalesce(max(e.position), 0) + 1000 into v_tail
    from public.queue_entries e
    join public.song_requests r on r.id = e.request_id
    where e.night_id = p_night_id
      and r.status in ('approved', 'queued', 'now_singing');
    v_position := greatest(coalesce(p_position, v_tail), v_tail);

    insert into public.queue_entries (venue_id, night_id, request_id, position)
    values (v_night.venue_id, p_night_id, v_request_id, v_position)
    returning id into v_entry_id;
  end if;

  return query select v_request_id, v_entry_id, v_status, null::text;
end;
$$;

revoke all on function public.submit_request(uuid, uuid, text[], text, numeric) from public;
grant execute on function public.submit_request(uuid, uuid, text[], text, numeric) to authenticated;
