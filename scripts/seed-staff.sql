-- Make a signed-in user staff of the demo venue. Run in the Supabase SQL editor (or psql)
-- AFTER the user has signed in once (Google/Microsoft/SMS), so auth.users has their row.
--
-- 1. Replace the email below with yours.
-- 2. Role: 'owner' sees everything (admin pages, rules, staff); 'dj' only runs the night.
--
-- The demo venue comes from supabase/seed.sql. On a remote project that was never seeded,
-- run seed.sql in the SQL editor first (it is idempotent: every insert is "on conflict do nothing").

insert into public.venue_members (venue_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', u.id, 'owner'
from auth.users u
where lower(u.email) = lower('you@example.com')
on conflict (venue_id, user_id) do update set role = excluded.role;

-- Check: one row with your user id.
select vm.venue_id, vm.user_id, vm.role, u.email
from public.venue_members vm
join auth.users u on u.id = vm.user_id
where vm.venue_id = '00000000-0000-0000-0000-000000000001';
