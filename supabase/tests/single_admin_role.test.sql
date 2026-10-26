-- Regression test for ADR-014 (single staff role: owner = admin = dj = 'admin').
--
-- Verifies the migration's two effects, which is where this change can go wrong:
--   1. every venue_members row is 'admin' (no row left on the old roles), and
--   2. no role-scoped policy still restricts by 'owner'/'dj' — i.e. each previously owner/admin or
--      owner-only policy was rewritten to a plain membership check, and the expected policies exist.
--
-- Pure catalog/structure assertions, so no auth.users fixture is needed. Run by the CI `migrations`
-- job after migrations + seed. Everything is in one rolled-back transaction.

begin;

do $$
declare
  v_n int;
  v_missing text;
  v_expected text[][] := array[
    array['venues', 'venues: staff update'],
    array['venue_members', 'venue_members: staff manage'],
    array['venue_tables', 'venue_tables: staff manage'],
    array['songs', 'songs: staff manage'],
    array['song_videos', 'song_videos: staff manage'],
    array['queue_rules', 'queue_rules: staff manage'],
    array['catalog_imports', 'catalog_imports: staff manage']
  ];
  v_row text[];
begin
  -- 1. Data migration: no member left on a non-admin role.
  if exists (select 1 from public.venue_members where role <> 'admin') then
    raise exception 'ADR-014: a venue_members row still has a non-admin role';
  end if;

  -- 2a. No public policy restricts by the old owner/dj role literals any more.
  select count(*) into v_n
  from pg_policies
  where schemaname = 'public'
    and ( strpos(coalesce(qual, ''), '''owner''') > 0
       or strpos(coalesce(with_check, ''), '''owner''') > 0
       or strpos(coalesce(qual, ''), '''dj''') > 0
       or strpos(coalesce(with_check, ''), '''dj''') > 0 );
  if v_n <> 0 then
    raise exception 'ADR-014: % public policies still reference the owner/dj roles', v_n;
  end if;

  -- 2b. The rewritten membership-based policies exist.
  foreach v_row slice 1 in array v_expected loop
    v_missing := v_row[2];
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_row[1] and policyname = v_row[2]
    ) then
      raise exception 'ADR-014: expected policy "%" on % is missing', v_row[2], v_row[1];
    end if;
  end loop;

  raise notice 'single_admin_role.test.sql: all assertions passed';
end;
$$;

rollback;
