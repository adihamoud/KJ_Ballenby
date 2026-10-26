-- Security regression test for pentest finding H1 (2026-10-26).
--
-- join_table must seat a guest ONLY when given valid proof (the per-venue join code, or the
-- globally-unique QR token). A bare/unknown code, or a real code for the wrong venue, must not
-- seat anyone. venue_table_labels must return rows only to staff and to participants of the
-- venue's open night.
--
-- Run by the CI `migrations` job against supabase/postgres after migrations + seed. Everything
-- happens in one transaction that is rolled back, so it leaves no data behind. A failed assertion
-- raises and (under psql -v ON_ERROR_STOP=1) fails the job.

begin;

do $$
declare
  v_venue uuid := '00000000-0000-0000-0000-000000000001';  -- demo venue from seed.sql
  v_other_venue uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_table_t1 uuid;
  v_qr_t1 uuid;
  v_group uuid;
  v_labels int;
begin
  -- A second venue + table whose code we will try to abuse cross-tenant.
  insert into public.venues (id, slug, name) values (v_other_venue, 'other-venue-h1', 'Other');
  insert into public.venue_tables (venue_id, label, join_code)
    values (v_other_venue, 'X1', 'OTHR1');

  select id, qr_token into v_table_t1, v_qr_t1
  from public.venue_tables where venue_id = v_venue and join_code = 'DEMO1';

  -- An open night for the demo venue so join_table has somewhere to seat.
  insert into public.nights (venue_id, status) values (v_venue, 'open');

  -- An anonymous auth user; the auth trigger creates the matching profile.
  insert into auth.users (id, aud, role) values (v_user, 'authenticated', 'authenticated');

  -- Impersonate that user for the rest of the transaction.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if auth.uid() <> v_user then
    raise exception 'test setup: auth.uid() did not pick up the jwt claim (got %)', auth.uid();
  end if;

  -- 1. No proof / unknown code -> not seated.
  if public.join_table('NOPE9', v_venue) is not null then
    raise exception 'H1: join_table seated the guest for an unknown code';
  end if;
  if public.join_table('DEMO1', null) is not null then
    raise exception 'H1: join_table seated the guest for a code without a venue';
  end if;

  -- 2. A real code for the WRONG venue -> not seated (no cross-tenant join).
  if public.join_table('OTHR1', v_venue) is not null then
    raise exception 'H1: join_table accepted another venue''s code';
  end if;
  -- The other venue has no open night, so even the right pairing returns null here (not a seat).
  if public.join_table('OTHR1', v_other_venue) is not null then
    raise exception 'H1: join_table seated into a venue with no open night';
  end if;

  if exists (select 1 from public.group_members where user_id = v_user) then
    raise exception 'H1: a failed join still created a group_members row';
  end if;

  -- 3. venue_table_labels gives a non-participant, non-staff caller nothing.
  select count(*) into v_labels from public.venue_table_labels(v_venue);
  if v_labels <> 0 then
    raise exception 'H1: venue_table_labels leaked % labels to a non-participant', v_labels;
  end if;

  -- 4. The correct per-venue code seats the guest.
  v_group := public.join_table('DEMO1', v_venue);
  if v_group is null then
    raise exception 'H1: valid join code did not seat the guest';
  end if;
  if not exists (
    select 1 from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_user and g.table_id = v_table_t1
  ) then
    raise exception 'H1: guest was not added to the resolved table''s group';
  end if;

  -- 5. The QR token (uuid) also seats, and lower case is accepted.
  if public.join_table(lower(v_qr_t1::text), null) is null then
    raise exception 'H1: valid QR token did not seat the guest';
  end if;

  -- 6. Now a participant, venue_table_labels returns the venue's labels.
  select count(*) into v_labels from public.venue_table_labels(v_venue);
  if v_labels < 1 then
    raise exception 'H1: venue_table_labels returned nothing to a participant';
  end if;

  raise notice 'join_table_proof.test.sql: all assertions passed';
end;
$$;

rollback;
