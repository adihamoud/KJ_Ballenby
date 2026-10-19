-- Make the signed-in user the owner of the demo venue.
-- Run in the Supabase SQL editor after your first login, replacing the email.

insert into public.venue_members (venue_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', u.id, 'owner'
from auth.users u
where u.email = 'you@example.com'
on conflict (venue_id, user_id) do update set role = excluded.role;
