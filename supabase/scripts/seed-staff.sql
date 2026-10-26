-- Make the signed-in user staff (role 'admin') of the demo venue. There is one staff role now
-- (owner = admin = dj = admin, see docs/DECISIONS.md). Run in the Supabase SQL editor after your
-- first login, replacing the email.

insert into public.venue_members (venue_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', u.id, 'admin'
from auth.users u
where u.email = 'you@example.com'
on conflict (venue_id, user_id) do update set role = excluded.role;
