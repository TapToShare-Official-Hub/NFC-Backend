-- ============================================================================
-- NFC tap-to-share — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- restaurants: one row per NFC card / restaurant. Looked up by `slug`.
-- ----------------------------------------------------------------------------
create table if not exists public.restaurants (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,   -- what /r/[slug] resolves against
  name               text not null,
  cuisine            text not null,          -- e.g. "Sichuan", "Neapolitan pizza"
  google_review_url  text,                   -- optional: direct "leave a review" link
  created_at         timestamptz not null default now()
);

-- Xiaohongshu direct-publish needs at least one image per note. Nullable:
-- restaurants without photos simply don't show the XHS button. No separate
-- photos table — one text[] column is enough for the MVP.
alter table public.restaurants add column if not exists photo_urls text[];

-- Optional restaurant logo, shown in the landing page footer so a tapped card
-- feels like the restaurant's own page. Nullable: no logo → footer renders the
-- plain "Powered by" line, exactly as before.
alter table public.restaurants add column if not exists logo_url text;

-- Optional WhatsApp contact number for the "Message us on WhatsApp" button.
-- Store international format without "+" (e.g. 60123456789); a leading-0 local
-- Malaysian number is normalised in code. Null → the button is hidden.
alter table public.restaurants add column if not exists whatsapp_number text;

-- Optional link to the restaurant's own Facebook page, used by the Facebook
-- button's "Open Facebook" destination. Null → the button is hidden, because
-- facebook.com's generic homepage is a dead end on a client's page.
alter table public.restaurants add column if not exists facebook_url text;

-- PROTOTYPE: hardcoded caption, remove for multi-restaurant.
-- For the demo, the Google Review button serves this fixed caption verbatim
-- instead of calling OpenAI. Null → fall back to normal generation.
alter table public.restaurants add column if not exists google_caption text;

-- ----------------------------------------------------------------------------
-- taps: append-only event log. One row per page visit ("tap") and per
-- caption generation ("caption"). Written fire-and-forget from the app.
-- ----------------------------------------------------------------------------
create table if not exists public.taps (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  event_type        text not null check (event_type in ('tap', 'caption')),
  platform          text,                    -- set only for 'caption' events
  restaurant_found  boolean,                 -- was the slug a known restaurant?
  created_at        timestamptz not null default now()
);

create index if not exists taps_slug_idx        on public.taps (slug);
create index if not exists taps_created_at_idx   on public.taps (created_at);

-- ----------------------------------------------------------------------------
-- xhs_publishes: one row per successful Xiaohongshu direct-publish handoff.
-- Written fire-and-forget after the /api/xhs/publish response is sent.
-- ----------------------------------------------------------------------------
create table if not exists public.xhs_publishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants (id),
  note_id       text,                        -- id returned by the myaibot bridge (may be null)
  created_at    timestamptz not null default now()
);

create index if not exists xhs_publishes_restaurant_idx
  on public.xhs_publishes (restaurant_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- The app uses the anon key, so we grant exactly the access it needs:
--   * anyone may READ restaurants (the landing page + caption route need it)
--   * anyone may INSERT taps (the event log)
-- Nobody can read the taps table with the anon key, and nobody can write
-- restaurants — manage those from the Supabase dashboard or a service key.
-- ----------------------------------------------------------------------------
alter table public.restaurants   enable row level security;
alter table public.taps          enable row level security;
alter table public.xhs_publishes enable row level security;

drop policy if exists "public read restaurants" on public.restaurants;
create policy "public read restaurants"
  on public.restaurants for select
  using (true);

drop policy if exists "public insert taps" on public.taps;
create policy "public insert taps"
  on public.taps for insert
  with check (true);

-- Same shape as taps: the anon key may append rows but never read them back.
drop policy if exists "public insert xhs_publishes" on public.xhs_publishes;
create policy "public insert xhs_publishes"
  on public.xhs_publishes for insert
  with check (true);

-- ----------------------------------------------------------------------------
-- Seed data — a couple of demo restaurants so you can test immediately.
-- Visit /r/golden-dragon or /r/nonna-pizza after deploying.
-- ----------------------------------------------------------------------------
insert into public.restaurants (slug, name, cuisine, google_review_url)
values
  ('golden-dragon', 'Golden Dragon', 'Sichuan',
   'https://search.google.com/local/writereview?placeid=REPLACE_WITH_PLACE_ID'),
  ('nonna-pizza', 'Nonna''s', 'Neapolitan pizza', null)
on conflict (slug) do nothing;

-- House of Fishball is the verified Xiaohongshu direct-publish demo restaurant.
-- Idempotent so a fresh setup gets it too; `do update` refreshes the fields we
-- own here without clobbering anything else on the row.
insert into public.restaurants (slug, name, cuisine, photo_urls)
values
  ('house-of-fishball', 'House of Fishball', 'Teochew fishball noodles',
   array['https://picsum.photos/720/960'])
on conflict (slug) do update set
  cuisine    = excluded.cuisine,
  photo_urls = excluded.photo_urls;

-- Standalone equivalent to run once against an existing live DB that already
-- has the house-of-fishball row (Supabase → SQL Editor → New query):
--
--   update public.restaurants
--   set cuisine = 'Teochew fishball noodles',
--       photo_urls = array['https://picsum.photos/720/960']
--   where slug = 'house-of-fishball';
