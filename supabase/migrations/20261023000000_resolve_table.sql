-- Guest join: resolve a printed QR token or a typed table code to a venue + table.
--
-- Guests are not signed in when they scan the QR (auth is wired later), so this
-- runs as security definer and is callable by the anon role. It returns a single
-- row for an active table of an active venue, plus the venue's open night (if any).
-- Nothing is written; no personal data is returned.

create or replace function public.resolve_table(p_code text)
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
  )
  select
    t.id,
    t.label,
    t.join_code,
    v.id,
    v.name,
    v.slug,
    n.id,
    n.id is not null
  from input i
  join public.venue_tables t
    on (i.token is not null and t.qr_token = i.token)
    or (i.token is null and t.join_code = i.code)
  join public.venues v on v.id = t.venue_id
  left join public.nights n on n.venue_id = v.id and n.status = 'open'
  where t.is_active
    and v.is_active
  order by t.created_at
  limit 1;
$$;

revoke all on function public.resolve_table(text) from public;
grant execute on function public.resolve_table(text) to anon, authenticated;
