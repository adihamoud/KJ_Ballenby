-- Collapse venue roles into a single role: owner = admin = dj = 'admin' (owner request, 2026-10-26).
--
-- Every venue_member now has the same, full access. The venue_role enum keeps its values
-- (Postgres enums are forward-only; dropping values means recreating the type and is not worth the
-- risk), but they are no longer used for authorization: existing rows are migrated to 'admin', the
-- app only ever writes 'admin', and every role-scoped policy below is rewritten to check plain
-- venue membership (`is_venue_staff(venue_id)` with no role filter). See docs/DECISIONS.md.
--
-- NOTE: this intentionally removes the owner/admin/dj authorization boundary. Any staff member can
-- now manage tables, QR codes, rules, the catalog AND other staff.

-- ---------------------------------------------------------------------------
-- Existing members -> admin
-- ---------------------------------------------------------------------------
update public.venue_members set role = 'admin' where role <> 'admin';

-- ---------------------------------------------------------------------------
-- Rewrite every role-scoped policy to a plain membership check
-- ---------------------------------------------------------------------------
drop policy if exists "venues: owner/admin update" on public.venues;
create policy "venues: staff update" on public.venues
  for update to authenticated
  using (public.is_venue_staff(id))
  with check (public.is_venue_staff(id));

drop policy if exists "venue_members: owner manage" on public.venue_members;
create policy "venue_members: staff manage" on public.venue_members
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

drop policy if exists "venue_tables: owner/admin manage" on public.venue_tables;
create policy "venue_tables: staff manage" on public.venue_tables
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

drop policy if exists "songs: owner/admin manage" on public.songs;
create policy "songs: staff manage" on public.songs
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

drop policy if exists "song_videos: owner/admin manage" on public.song_videos;
create policy "song_videos: staff manage" on public.song_videos
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

drop policy if exists "queue_rules: owner/admin manage" on public.queue_rules;
create policy "queue_rules: staff manage" on public.queue_rules
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

drop policy if exists "catalog_imports: owner/admin manage" on public.catalog_imports;
create policy "catalog_imports: staff manage" on public.catalog_imports
  for all to authenticated
  using (public.is_venue_staff(venue_id))
  with check (public.is_venue_staff(venue_id));

-- ---------------------------------------------------------------------------
-- Storage policies (only where the storage schema is present, as in the init migration)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public'
  ) then
    drop policy if exists "catalog-imports: owner/admin upload" on storage.objects;
    drop policy if exists "catalog-imports: owner/admin read" on storage.objects;
    execute $policy$
      create policy "catalog-imports: staff upload" on storage.objects
        for insert to authenticated with check (
          bucket_id = 'catalog-imports'
          and public.is_venue_staff(((storage.foldername(name))[1])::uuid)
        )
    $policy$;
    execute $policy$
      create policy "catalog-imports: staff read" on storage.objects
        for select to authenticated using (
          bucket_id = 'catalog-imports'
          and public.is_venue_staff(((storage.foldername(name))[1])::uuid)
        )
    $policy$;
  else
    raise notice 'storage schema not initialised; skipping catalog-imports storage policy rewrite';
  end if;
end;
$$;

-- down: recreate the owner/admin and owner-only policies from 20261019000000_init.sql and
--       20261023120000_song_videos_and_search.sql; the role data change is not reversible per-row.
