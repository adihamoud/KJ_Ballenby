-- Fix: "infinite recursion detected in policy for relation group_members".
--
-- The initial read policy on group_members checked "is the caller a member of the same group"
-- with a subquery on group_members itself, which re-enters the same policy. It went unnoticed
-- because every path so far reached the table through security-definer functions (join_table,
-- is_night_participant); the guest loader now reads its own membership directly and hit it.
--
-- The "same group" check moves into a security-definer helper, like is_night_participant.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

drop policy if exists "group_members: read" on public.group_members;
create policy "group_members: read" on public.group_members
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id and public.is_venue_staff(g.venue_id)
    )
  );
