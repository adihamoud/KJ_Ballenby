-- Guest song requests (ADR-009).
--
-- Guests are signed in anonymously by the join action, so `auth.uid()` is a real user id and the
-- policies from the initial migration apply as written. This migration adds what the request flow
-- still needs:
--   * join_table(table_id)     - find or create the table's group in the open night, add the caller.
--   * submit_request(...)      - insert song_requests + queue_entries in one transaction, re-checking
--                                maxPendingPerUser under a lock. The engine decides first (Server
--                                Action); the RPC guards against races and forged calls.
--   * a trigger that closes the queue entry when a request reaches a terminal status, so a guest
--     cancel (plain RLS update on song_requests) never leaves a live queue_entries row behind.

-- ---------------------------------------------------------------------------
-- One active group per table per night (DATA_MODEL.md section 3).
-- ---------------------------------------------------------------------------
create unique index if not exists groups_one_active_per_table
  on public.groups (night_id, table_id)
  where is_active and table_id is not null;

create index if not exists song_requests_night_song_idx
  on public.song_requests (night_id, song_id, created_at desc);

-- ---------------------------------------------------------------------------
-- join_table(table_id) -> group id (null when the table's venue has no open night)
-- ---------------------------------------------------------------------------
create or replace function public.join_table(p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_table public.venue_tables%rowtype;
  v_night_id uuid;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'join_table: not signed in' using errcode = '42501';
  end if;

  select t.* into v_table
  from public.venue_tables t
  join public.venues v on v.id = t.venue_id
  where t.id = p_table_id and t.is_active and v.is_active;
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
  perform pg_advisory_xact_lock(hashtext(v_night_id::text), hashtext(p_table_id::text));

  select g.id into v_group_id
  from public.groups g
  where g.night_id = v_night_id and g.table_id = p_table_id and g.is_active
  order by g.created_at
  limit 1;

  if v_group_id is null then
    insert into public.groups (venue_id, night_id, table_id, name, created_by)
    values (v_table.venue_id, v_night_id, p_table_id, v_table.label, v_uid)
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

revoke all on function public.join_table(uuid) from public;
grant execute on function public.join_table(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_request(night, song, singers, note, position)
-- ---------------------------------------------------------------------------
-- Returns one row. On success `reason` is null and `request_id` is set (`entry_id` too when the
-- request went straight to the queue). On rejection only `reason` is set, with one of the engine's
-- reason codes or NOT_PARTICIPANT.
--
-- The Server Action runs `evaluateRequest` from @kj/queue-engine first and shows the guest the
-- reason. This function is callable by any authenticated user, so it re-checks every guest-facing
-- rule of QUEUE_RULES.md section 3 (same order, same reason codes) against the rows it is about to
-- write: a forged call cannot do what the engine would have refused. The engine and its tests
-- remain the specification; keep this block in step with it.
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

  -- Trim, drop empties, cap length and count (the engine already enforced maxSingersPerSong).
  select coalesce(array_agg(q.singer), '{}'::text[]) into v_singers
  from (
    select left(regexp_replace(trim(x), '\s+', ' ', 'g'), 40) as singer
    from unnest(coalesce(p_singers, '{}'::text[])) as x
    where trim(x) <> ''
    limit 10
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

-- ---------------------------------------------------------------------------
-- Terminal request -> closed queue entry.
-- ---------------------------------------------------------------------------
-- Guests cancel through the "song_requests: cancel own pending" policy and cannot touch
-- queue_entries, so the entry is closed here (security definer) instead.
create or replace function public.end_queue_entry_on_terminal_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('done', 'skipped', 'cancelled') and new.status is distinct from old.status then
    update public.queue_entries e
    set ended_at = coalesce(e.ended_at, now()), updated_at = now()
    where e.request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists song_requests_end_entry on public.song_requests;
create trigger song_requests_end_entry
  after update of status on public.song_requests
  for each row execute function public.end_queue_entry_on_terminal_request();

-- down: drop trigger song_requests_end_entry and its function, submit_request, join_table,
-- the two indexes above.
