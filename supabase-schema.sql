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
-- Row Level Security
-- The app uses the anon key, so we grant exactly the access it needs:
--   * anyone may READ restaurants (the landing page + caption route need it)
--   * anyone may INSERT taps (the event log)
-- Nobody can read the taps table with the anon key, and nobody can write
-- restaurants — manage those from the Supabase dashboard or a service key.
-- ----------------------------------------------------------------------------
alter table public.restaurants enable row level security;
alter table public.taps        enable row level security;

drop policy if exists "public read restaurants" on public.restaurants;
create policy "public read restaurants"
  on public.restaurants for select
  using (true);

drop policy if exists "public insert taps" on public.taps;
create policy "public insert taps"
  on public.taps for insert
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
