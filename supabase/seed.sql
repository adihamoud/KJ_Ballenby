-- Local development seed. Creates a demo venue with tables, a song catalog and default rules.
-- Staff membership is added by scripts/seed-staff.sql after you sign in once (needs your user id).

insert into public.venues (id, slug, name, timezone, default_locale)
values ('00000000-0000-0000-0000-000000000001', 'demo-bar', 'Demo Karaoke Bar', 'Asia/Jerusalem', 'he')
on conflict (slug) do nothing;

insert into public.queue_rules (venue_id, config)
values (
  '00000000-0000-0000-0000-000000000001',
  '{
    "fairness": "round_robin_table",
    "maxPendingPerUser": 1,
    "maxPendingPerTable": null,
    "cooldownMinutesPerUser": 0,
    "requireHostApproval": false,
    "allowDuets": true,
    "maxSingersPerSong": 4,
    "hostPriorityEnabled": true,
    "duplicateSongWindowMinutes": 60,
    "nightCutoffMinutesBeforeClose": null
  }'::jsonb
)
on conflict (venue_id) do nothing;

insert into public.venue_tables (venue_id, label, join_code)
values
  ('00000000-0000-0000-0000-000000000001', 'T1', 'DEMO1'),
  ('00000000-0000-0000-0000-000000000001', 'T2', 'DEMO2'),
  ('00000000-0000-0000-0000-000000000001', 'T3', 'DEMO3'),
  ('00000000-0000-0000-0000-000000000001', 'Bar', 'DEMOB')
on conflict do nothing;

insert into public.songs (venue_id, title, artist, language, duration_sec)
values
  ('00000000-0000-0000-0000-000000000001', 'Bohemian Rhapsody', 'Queen', 'en', 354),
  ('00000000-0000-0000-0000-000000000001', 'Dancing Queen', 'ABBA', 'en', 231),
  ('00000000-0000-0000-0000-000000000001', 'Wonderwall', 'Oasis', 'en', 258),
  ('00000000-0000-0000-0000-000000000001', 'Shallow', 'Lady Gaga & Bradley Cooper', 'en', 215),
  ('00000000-0000-0000-0000-000000000001', 'הללויה', 'גלי עטרי וחלב ודבש', 'he', 180),
  ('00000000-0000-0000-0000-000000000001', 'תודה', 'חיים משה', 'he', 240),
  ('00000000-0000-0000-0000-000000000001', 'שיר לשלום', 'להקת הנח"ל', 'he', 230),
  ('00000000-0000-0000-0000-000000000001', 'אבניבי', 'יזהר כהן', 'he', 180),
  ('00000000-0000-0000-0000-000000000001', 'דיווה', 'דנה אינטרנשיונל', 'he', 180),
  ('00000000-0000-0000-0000-000000000001', 'Toy', 'Netta', 'en', 180)
on conflict do nothing;
