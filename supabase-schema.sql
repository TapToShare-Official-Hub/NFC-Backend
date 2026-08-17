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
-- restaurant_photos: the photo pool. One row per photo, consumed exactly once.
--
-- Replaces restaurants.photo_urls[0], which handed every customer the same
-- first photo forever. `claimed_at` is the whole mechanism: null means "never
-- used", and claiming is a single atomic UPDATE so two customers tapping in
-- the same second can never be handed the same photo.
-- ----------------------------------------------------------------------------
create table if not exists public.restaurant_photos (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  url            text not null,
  position       int  not null default 0,   -- hand-out order
  claimed_at     timestamptz,               -- null = never used yet
  use_count      int  not null default 0,   -- how many times handed out
  created_at     timestamptz not null default now()
);

-- Partial index: the claim query only ever scans unclaimed rows, so this stays
-- fast as claimed photos pile up.
create index if not exists restaurant_photos_unclaimed_idx
  on public.restaurant_photos (restaurant_id, position)
  where claimed_at is null;

-- The same photo must not be loaded into one restaurant's pool twice —
-- otherwise "used exactly once" is a lie at the data level.
create unique index if not exists restaurant_photos_unique_url
  on public.restaurant_photos (restaurant_id, url);

-- ----------------------------------------------------------------------------
-- claim_photos: hand out the next N unused photos and mark them used, in one
-- atomic statement.
--
-- FOR UPDATE SKIP LOCKED is what makes concurrency safe: a second caller
-- arriving mid-transaction skips the rows already being claimed rather than
-- blocking on them or handing out duplicates.
--
-- SECURITY DEFINER because the anon key must be able to claim without being
-- granted blanket write access to the table.
-- ----------------------------------------------------------------------------
-- p_recycle = true  → least-recently-used rotation, the pool never runs dry.
--                     Required for a small pool (6 photos over a 14-day trial).
-- p_recycle = false → each photo used exactly once, then exhausted. Use when
--                     the pool is big enough that repeats would look sloppy.
create or replace function public.claim_photos(
  p_slug    text,
  p_count   int     default 1,
  p_recycle boolean default true
)
returns table (url text)
language sql
security definer
set search_path = public
as $$
  update public.restaurant_photos p
  set claimed_at = now(),
      use_count  = p.use_count + 1
  where p.id in (
    select p2.id
    from public.restaurant_photos p2
    join public.restaurants r on r.id = p2.restaurant_id
    where r.slug = p_slug
      and (p_recycle or p2.claimed_at is null)
    -- Never-used photos first, then the one sitting unused the longest.
    order by p2.claimed_at nulls first, p2.position
    limit greatest(coalesce(p_count, 1), 1)
    for update skip locked
  )
  returning p.url;
$$;

-- Put photos back when the publish fails downstream, so a myaibot error
-- doesn't silently burn a photo the customer never actually posted.
create or replace function public.release_photos(p_slug text, p_urls text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.restaurant_photos p
  set claimed_at = null,
      use_count  = greatest(p.use_count - 1, 0)
  from public.restaurants r
  where r.id = p.restaurant_id
    and r.slug = p_slug
    and p.url = any(p_urls);
$$;

alter table public.restaurant_photos enable row level security;
-- No policies on purpose: nothing reaches this table except the two
-- security-definer functions above.
revoke all on function public.claim_photos(text, int, boolean) from public;
revoke all on function public.release_photos(text, text[])     from public;
grant execute on function public.claim_photos(text, int, boolean) to anon;
grant execute on function public.release_photos(text, text[])     to anon;

-- Loading a pool (example — 90 photos for one restaurant). `position` comes
-- from the array order, and the unique index makes re-running this safe.
--
--   insert into public.restaurant_photos (restaurant_id, url, position)
--   select r.id, photo.url, photo.ord
--   from public.restaurants r,
--        unnest(array[
--          'https://.../01.jpg',
--          'https://.../02.jpg'
--        ]) with ordinality as photo(url, ord)
--   where r.slug = 'bunnywokandgrill'
--   on conflict (restaurant_id, url) do nothing;
--
-- How many are left:
--   select count(*) filter (where claimed_at is null) as available,
--          count(*) as total
--   from public.restaurant_photos p
--   join public.restaurants r on r.id = p.restaurant_id
--   where r.slug = 'bunnywokandgrill';

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
