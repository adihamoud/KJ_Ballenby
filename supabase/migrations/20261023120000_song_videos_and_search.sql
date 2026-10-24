-- Catalog: YouTube versions per song + anonymous catalog search for the guest flow.
--
-- A song can have several karaoke videos on YouTube (different channels, keys, with or
-- without guide vocals). `song_videos` keeps one row per version; the watch URL and the
-- thumbnail are derived from `youtube_id` in code, so nothing else is stored.
-- `search_songs` is callable by anon (guests are not signed in yet, see ADR-008) and only
-- returns active songs of an active venue.

-- ---------------------------------------------------------------------------
-- song_videos
-- ---------------------------------------------------------------------------
create table public.song_videos (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  label text,
  duration_sec int check (duration_sec is null or duration_sec > 0),
  -- false when the channel disables embedding (the link still works, in-app preview does not)
  embeddable boolean not null default true,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, youtube_id)
);
create index song_videos_song_idx on public.song_videos (song_id, sort_order) where is_active;
create index song_videos_venue_idx on public.song_videos (venue_id);

create trigger song_videos_set_updated_at before update on public.song_videos
  for each row execute function public.set_updated_at();

alter table public.song_videos enable row level security;

-- Same shape as songs: signed-in users read active rows, owner/admin manage.
create policy "song_videos: read active" on public.song_videos
  for select to authenticated using (is_active or public.is_venue_staff(venue_id));
create policy "song_videos: owner/admin manage" on public.song_videos
  for all to authenticated
  using (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]))
  with check (public.is_venue_staff(venue_id, array['owner', 'admin']::public.venue_role[]));

-- ---------------------------------------------------------------------------
-- search_songs(venue, query, language, limit)
-- ---------------------------------------------------------------------------
-- Prefix full-text match on title + artist (Hebrew or Latin), with a substring fallback
-- so "rhap" or "ללוי" still hit. Empty query lists the catalog alphabetically (browse).
create or replace function public.search_songs(
  p_venue_id uuid,
  p_query text default '',
  p_language text default null,
  p_limit int default 30
)
returns table (
  id uuid,
  title text,
  artist text,
  language text,
  duration_sec int,
  videos jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text := nullif(trim(coalesce(p_query, '')), '');
  v_tsq tsquery;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if not exists (select 1 from public.venues v where v.id = p_venue_id and v.is_active) then
    return;
  end if;

  if v_raw is not null then
    select to_tsquery('simple', string_agg(w.word || ':*', ' & '))
      into v_tsq
    from (
      select regexp_replace(t, '[^\w]', '', 'g') as word
      from regexp_split_to_table(v_raw, '\s+') as t
    ) as w
    where w.word <> '';
  end if;

  return query
  select
    s.id,
    s.title,
    s.artist,
    s.language,
    s.duration_sec,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'youtube_id', v.youtube_id,
            'label', v.label,
            'duration_sec', v.duration_sec,
            'embeddable', v.embeddable
          )
          order by v.sort_order, v.created_at
        )
        from public.song_videos v
        where v.song_id = s.id and v.is_active
      ),
      '[]'::jsonb
    ) as videos
  from public.songs s
  where s.venue_id = p_venue_id
    and s.is_active
    and (p_language is null or s.language = p_language)
    and (
      v_raw is null
      or (v_tsq is not null and s.search @@ v_tsq)
      or s.title ilike '%' || v_raw || '%'
      or s.artist ilike '%' || v_raw || '%'
    )
  order by
    case when v_tsq is not null then ts_rank(s.search, v_tsq) else 0 end desc,
    s.title
  limit v_limit;
end;
$$;

revoke all on function public.search_songs(uuid, text, text, int) from public;
grant execute on function public.search_songs(uuid, text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Demo venue catalog: 14 songs with real YouTube karaoke versions (ids verified 2026-10-23).
-- Only touches the seeded demo venue; no-op elsewhere.
-- ---------------------------------------------------------------------------
insert into public.songs (venue_id, title, artist, language, duration_sec)
select '00000000-0000-0000-0000-000000000001', t.title, t.artist, t.language, t.duration_sec
from (values
  ('Sweet Caroline', 'Neil Diamond', 'en', 225),
  ('Don''t Stop Believin''', 'Journey', 'en', 275),
  ('I Will Survive', 'Gloria Gaynor', 'en', 230),
  ('Livin'' on a Prayer', 'Bon Jovi', 'en', 273)
) as t(title, artist, language, duration_sec)
where exists (select 1 from public.venues where id = '00000000-0000-0000-0000-000000000001')
on conflict (venue_id, title, artist) do nothing;

insert into public.song_videos (venue_id, song_id, youtube_id, label, duration_sec, embeddable, sort_order)
select s.venue_id, s.id, v.youtube_id, v.label, v.duration_sec, v.embeddable, v.sort_order
from (values
  ('Bohemian Rhapsody', 'Queen', '9Lxm0iSnKNc', 'Sing King', 375, false, 0),
  ('Bohemian Rhapsody', 'Queen', 'xyF04rAhHaQ', 'Starlight Karaoke', 346, true, 1),
  ('Bohemian Rhapsody', 'Queen', 'yvEcMrstp80', 'Zoom Karaoke (lyrics on screen)', 365, true, 2),
  ('Dancing Queen', 'ABBA', 'WHayJZ3eMcE', 'Sing King', 256, false, 0),
  ('Dancing Queen', 'ABBA', 'qjMSGIfB1j8', 'Atomic Karaoke (HD)', 233, true, 1),
  ('Dancing Queen', 'ABBA', '7fCMws3U2zE', 'KaraFun', 244, false, 2),
  ('Wonderwall', 'Oasis', 'R_EXyGWI9rU', 'Sing King', 291, false, 0),
  ('Wonderwall', 'Oasis', '0BFeMQkYteo', 'KaraFun', 253, false, 1),
  ('Wonderwall', 'Oasis', 'i3SeJ6-sr5o', 'Acoustic', 270, true, 2),
  ('Shallow', 'Lady Gaga & Bradley Cooper', '_nHT_k9Rswc', 'Sing King', 225, false, 0),
  ('Shallow', 'Lady Gaga & Bradley Cooper', 'smu-0V7E7wI', 'Mi Balmz', 228, true, 1),
  ('Shallow', 'Lady Gaga & Bradley Cooper', 'b6I_YR1nlIY', 'Piano', 253, false, 2),
  ('Toy', 'Netta', 'ejcycvyGzRs', 'Sing King', 185, false, 0),
  ('Toy', 'Netta', 'VcM01mLjNDg', 'King Of Karaoke', 195, true, 1),
  ('Sweet Caroline', 'Neil Diamond', 'srLoAl1mhFw', 'Sing King', 241, false, 0),
  ('Sweet Caroline', 'Neil Diamond', 'IM8pV2wedpc', 'KaraFun', 234, false, 1),
  ('Sweet Caroline', 'Neil Diamond', 'UcWEfvu6F_s', 'Atomic Karaoke (HD)', 225, true, 2),
  ('Don''t Stop Believin''', 'Journey', 'c8wn2fMYvns', 'Sing King', 276, false, 0),
  ('Don''t Stop Believin''', 'Journey', 'YRFNMAFL5j0', 'KaraFun', 258, false, 1),
  ('Don''t Stop Believin''', 'Journey', '1pOFPExPDCY', 'Atomic Karaoke (HD)', 275, true, 2),
  ('I Will Survive', 'Gloria Gaynor', 'FsUa8P-L2Ag', 'Sing King', 230, false, 0),
  ('I Will Survive', 'Gloria Gaynor', 'l7cJwvvWopk', 'KaraFun', 206, false, 1),
  ('Livin'' on a Prayer', 'Bon Jovi', 'Ep6G3P2v5ZA', 'Sing King', 273, false, 0),
  ('Livin'' on a Prayer', 'Bon Jovi', 'FDN5GYvEzvc', 'KaraFun', 257, false, 1),
  ('הללויה', 'גלי עטרי וחלב ודבש', 'OLLQsUlesD4', 'קריוקי', 204, true, 0),
  ('הללויה', 'גלי עטרי וחלב ודבש', '0T6f9MZwgxE', 'גרסה מקוצרת', 144, true, 1),
  ('הללויה', 'גלי עטרי וחלב ודבש', 'uuFKEL8b65I', 'Eurovision 1979 (karaoké)', 209, true, 2),
  ('תודה', 'חיים משה', '1Rq16P8tqlI', 'קריוקי', 136, true, 0),
  ('תודה', 'חיים משה', 'PeBNlOp5FuA', 'Studio Lab', 222, true, 1),
  ('שיר לשלום', 'להקת הנח"ל', 'f1mAdmZDL3g', 'קריוקי פסנתר (שירי מימון)', 341, true, 0),
  ('שיר לשלום', 'להקת הנח"ל', '46Xjxx4p6KY', 'PianoNati', 291, true, 1),
  ('אבניבי', 'יזהר כהן', 'h0Tm0KLzU4M', 'בא-לי קריוקי', 184, true, 0),
  ('אבניבי', 'יזהר כהן', 'r5raBI4kcoM', 'Midi cover', 189, true, 1),
  ('דיווה', 'דנה אינטרנשיונל', 'FG3wuRnZuto', 'עברית', 183, true, 0),
  ('דיווה', 'דנה אינטרנשיונל', '0DzkKK3sgJ8', 'Party Tyme', 197, true, 1),
  ('דיווה', 'דנה אינטרנשיונל', 'pKtSHCF89Mo', 'English version', 188, true, 2)
) as v(title, artist, youtube_id, label, duration_sec, embeddable, sort_order)
join public.songs s
  on s.venue_id = '00000000-0000-0000-0000-000000000001'
 and s.title = v.title
 and s.artist = v.artist
on conflict (song_id, youtube_id) do nothing;
