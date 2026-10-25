-- Catalog import (PRD A1, ADR-010).
--
-- The admin's browser parses the uploaded CSV / VirtualDJ file, keeps the raw file in the
-- `catalog-imports` bucket, and sends normalized rows in chunks through Server Actions to the two
-- functions below. Both are `security invoker`: they run as the signed-in admin, so the existing
-- owner/admin policies on `songs` and `catalog_imports` are the authorization check and no service
-- role is involved.
--
-- 1. `songs.last_import_id` marks which import last saw a song, so "deactivate songs missing from
--    the file" can run once at the end of a chunked import.
-- 2. Songs match case-insensitively on (title, artist): "queen" and "Queen" are one song. The
--    unique constraint stays case-sensitive; the new index serves the import's lookup.
-- 3. `import_catalog_chunk(import_id, rows)` upserts one chunk and accumulates the stats.
-- 4. `finish_catalog_import(import_id, deactivate_missing)` optionally deactivates every active
--    song the import did not touch, then marks the import done. It refuses to deactivate when the
--    import touched nothing, so an empty file can never switch the whole catalog off.
-- 5. At most one `processing` import per venue, so two tabs cannot deactivate each other's songs.

alter table public.songs
  add column last_import_id uuid references public.catalog_imports (id) on delete set null;

create index songs_venue_lower_idx
  on public.songs (venue_id, lower(title), lower(artist));

create unique index catalog_imports_one_processing
  on public.catalog_imports (venue_id) where status = 'processing';

-- ---------------------------------------------------------------------------
-- import_catalog_chunk
-- ---------------------------------------------------------------------------
create or replace function public.import_catalog_chunk(p_import_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venue uuid;
  v_status public.import_status;
  v_given int;
  v_valid int;
  v_clean jsonb;
  v_inserted int;
  v_updated int;
  v_stats jsonb;
begin
  -- RLS hides imports of other venues and from non-admins: they read as "not found".
  select venue_id, status into v_venue, v_status
  from public.catalog_imports
  where id = p_import_id
  for update;
  if v_venue is null then
    raise exception 'import_catalog_chunk: import not found' using errcode = 'P0002';
  end if;
  if v_status <> 'processing' then
    raise exception 'import_catalog_chunk: import is %', v_status using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'import_catalog_chunk: rows must be an array' using errcode = '22023';
  end if;
  v_given := jsonb_array_length(p_rows);
  if v_given > 1000 then
    raise exception 'import_catalog_chunk: at most 1000 rows per chunk' using errcode = '22023';
  end if;

  -- Same limits as the app's sanitizer; rows outside them are counted as skipped. Within the chunk
  -- the first occurrence of a (title, artist) pair wins.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb), count(*)
  into v_clean, v_valid
  from (
    select distinct on (lower(r.title), lower(r.artist))
      r.title,
      r.artist,
      case when r.language ~ '^[a-z]{2}$' then r.language end as language,
      case when r.duration ~ '^[0-9]{1,5}$' and r.duration::int between 1 and 86400
        then r.duration::int end as duration_sec,
      nullif(left(btrim(coalesce(r.external_ref, '')), 1000), '') as external_ref
    from (
      select btrim(e.value ->> 'title') as title, btrim(e.value ->> 'artist') as artist,
             e.value ->> 'language' as language, e.value ->> 'duration_sec' as duration,
             e.value ->> 'external_ref' as external_ref, e.ord
      from jsonb_array_elements(p_rows) with ordinality as e(value, ord)
      where jsonb_typeof(e.value) = 'object'
    ) r
    where char_length(coalesce(r.title, '')) between 1 and 300
      and char_length(coalesce(r.artist, '')) between 1 and 300
    order by lower(r.title), lower(r.artist), r.ord
  ) d;

  -- Existing songs (any case) are refreshed and reactivated; a value missing from the file keeps
  -- what the catalog already had.
  with c as (
    select * from jsonb_to_recordset(v_clean)
      as c(title text, artist text, language text, duration_sec int, external_ref text)
  ),
  u as (
    update public.songs s
    set language = coalesce(c.language, s.language),
        duration_sec = coalesce(c.duration_sec, s.duration_sec),
        external_ref = coalesce(c.external_ref, s.external_ref),
        is_active = true,
        last_import_id = p_import_id
    from c
    where s.venue_id = v_venue
      and lower(s.title) = lower(c.title)
      and lower(s.artist) = lower(c.artist)
    returning lower(s.title) as t, lower(s.artist) as a
  )
  select count(distinct (t, a)) into v_updated from u;

  insert into public.songs (venue_id, title, artist, language, duration_sec, external_ref, last_import_id)
  select v_venue, c.title, c.artist, c.language, c.duration_sec, c.external_ref, p_import_id
  from jsonb_to_recordset(v_clean)
    as c(title text, artist text, language text, duration_sec int, external_ref text)
  where not exists (
    select 1 from public.songs s
    where s.venue_id = v_venue
      and lower(s.title) = lower(c.title)
      and lower(s.artist) = lower(c.artist)
  )
  on conflict (venue_id, title, artist) do nothing;
  get diagnostics v_inserted = row_count;

  update public.catalog_imports
  set stats = stats || jsonb_build_object(
        'inserted', coalesce((stats ->> 'inserted')::int, 0) + v_inserted,
        'updated', coalesce((stats ->> 'updated')::int, 0) + v_updated,
        'skipped', coalesce((stats ->> 'skipped')::int, 0) + (v_given - v_valid)
      )
  where id = p_import_id
  returning stats into v_stats;

  return v_stats;
end;
$$;

revoke all on function public.import_catalog_chunk(uuid, jsonb) from public;
grant execute on function public.import_catalog_chunk(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- finish_catalog_import
-- ---------------------------------------------------------------------------
create or replace function public.finish_catalog_import(
  p_import_id uuid,
  p_deactivate_missing boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venue uuid;
  v_status public.import_status;
  v_touched int;
  v_deactivated int := 0;
  v_stats jsonb;
begin
  select venue_id, status into v_venue, v_status
  from public.catalog_imports
  where id = p_import_id
  for update;
  if v_venue is null then
    raise exception 'finish_catalog_import: import not found' using errcode = 'P0002';
  end if;
  if v_status <> 'processing' then
    raise exception 'finish_catalog_import: import is %', v_status using errcode = '22023';
  end if;

  if p_deactivate_missing then
    select count(*) into v_touched
    from public.songs
    where venue_id = v_venue and last_import_id = p_import_id;
    if v_touched = 0 then
      raise exception 'finish_catalog_import: nothing imported, refusing to deactivate the catalog'
        using errcode = '22023';
    end if;

    update public.songs
    set is_active = false
    where venue_id = v_venue
      and is_active
      and last_import_id is distinct from p_import_id;
    get diagnostics v_deactivated = row_count;
  end if;

  update public.catalog_imports
  set status = 'done',
      error = null,
      stats = stats || jsonb_build_object('deactivated', v_deactivated)
  where id = p_import_id
  returning stats into v_stats;

  return v_stats;
end;
$$;

revoke all on function public.finish_catalog_import(uuid, boolean) from public;
grant execute on function public.finish_catalog_import(uuid, boolean) to authenticated;

-- down: drop function public.finish_catalog_import(uuid, boolean);
--       drop function public.import_catalog_chunk(uuid, jsonb);
--       drop index public.catalog_imports_one_processing;
--       drop index public.songs_venue_lower_idx;
--       alter table public.songs drop column last_import_id;
