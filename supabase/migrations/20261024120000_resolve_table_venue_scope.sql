-- Review fixes for the guest flow (2026-10-24).
--
-- 1. resolve_table: a typed join_code is only unique per venue (venue_tables unique (venue_id,
--    join_code)), so the old "oldest table wins" lookup could seat a guest at another venue's
--    table. The function now takes an optional p_venue_id (the guest home passes the venue from
--    the session) and, without one, answers "no row" when the code exists in more than one venue.
--    The QR token (uuid) is globally unique and unaffected.
-- 2. submit_request: the singers list is capped at 20, the same hard cap the web app applies
--    (SINGERS_HARD_MAX), instead of 10. Everything else is unchanged.

-- ---------------------------------------------------------------------------
-- resolve_table(code, venue_id default null)
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_table(text);

create or replace function public.resolve_table(p_code text, p_venue_id uuid default null)
returns table (
  table_id uuid,
  table_label text,
  join_code text,
  venue_id uuid,
  venue_name text,
  venue_slug text,
  night_id uuid,
  night_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      upper(trim(p_code)) as code,
      case
        when trim(p_code) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then trim(p_code)::uuid
      end as token
  ),
  matches as (
    select
      t.id as t_id,
      t.label as t_label,
      t.join_code as t_join_code,
      t.created_at as t_created_at,
      v.id as v_id,
      v.name as v_name,
      v.slug as v_slug
    from input i
    join public.venue_tables t
      on (i.token is not null and t.qr_token = i.token)
      or (i.token is null and t.join_code = i.code)
    join public.venues v on v.id = t.venue_id
    where t.is_active
      and v.is_active
      and (p_venue_id is null or t.venue_id = p_venue_id)
  )
  select
    m.t_id,
    m.t_label,
    m.t_join_code,
    m.v_id,
    m.v_name,
    m.v_slug,
    n.id,
    n.id is not null
  from matches m
  left join public.nights n on n.venue_id = m.v_id and n.status = 'open'
  -- Ambiguous typed code (same code in several venues): no row, never an arbitrary venue.
  where (select count(distinct mm.v_id) from matches mm) = 1
  order by m.t_created_at
  limit 1;
$$;

revoke all on function public.resolve_table(text, uuid) from public;
grant execute on function public.resolve_table(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_request: singers cap 20 (was 10). Full body repeated; only the `limit` changed.
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

  -- Trim, drop empties, cap length (40) and count (20, SINGERS_HARD_MAX in the web app); the engine
  -- already enforced maxSingersPerSong on the same list.
  select coalesce(array_agg(q.singer), '{}'::text[]) into v_singers
  from (
    select left(regexp_replace(trim(x), '\s+', ' ', 'g'), 40) as singer
    from unnest(coalesce(p_singers, '{}'::text[])) as x
    where trim(x) <> ''
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
