# Slug-Based Review/Share System — Architecture Notes

Read-only investigation, written to document the current `/r/[slug]` flow so it
can be re-implemented (or ported) onto a separate static landing page later.

---

## 1. Stack & Entry Points

**Framework:** Next.js **15.5** (App Router — confirmed by `app/` directory
structure, `next.config.mjs`, and `export const dynamic` / `after()` usage
which are App Router / Next 15 APIs). React 19. TypeScript, strict mode.

**Deployment:** Vercel, zero-config. There is **no `vercel.json`** — the
README confirms Vercel auto-detects Next.js with no custom build settings.
No `middleware.ts` anywhere in the repo — nothing runs at the edge before a
route handler.

**Config files:**
- [next.config.mjs](next.config.mjs) — trivial, only `reactStrictMode: true`.
- [.env.local.example](.env.local.example) — declares the 5 env vars:
  `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MYAIBOT_API_KEY`,
  `DEV_MOCK_XHS`. All server-side only (no `NEXT_PUBLIC_` prefix).
- [tsconfig.json](tsconfig.json) — path alias `@/*` → repo root.

**Every route/page:**

| Path | Type | Purpose |
|---|---|---|
| `app/page.tsx` | page (static) | Root `/` — static explainer, no logic |
| `app/r/[slug]/page.tsx` | **page (dynamic route, server component)** | **Slug resolution — the core of the system** |
| `app/r/[slug]/Landing.tsx` | client component | Rendered by the page above once a restaurant is resolved |
| `app/r/[slug]/PlatformIcon.tsx` | client component | Pure icon rendering, no data logic |
| `app/api/caption/route.ts` | API route (`POST`) | Generates a platform caption for a resolved slug |
| `app/api/xhs/publish/route.ts` | API route (`POST`) | Xiaohongshu direct-publish bridge for a resolved slug |

The slug-handling route is **`app/r/[slug]/page.tsx`** — a single dynamic
segment, not a catch-all (`[...slug]`). Both API routes take `slug` in the
POST body (not the URL) and re-resolve it independently server-side.

---

## 2. Slug Resolution (the core)

File: [app/r/[slug]/page.tsx](app/r/[slug]/page.tsx)

```tsx
import { after } from 'next/server';
import { supabase, type Restaurant } from '@/lib/supabase';
import { logTap } from '@/lib/log';
import Landing from './Landing';

export const dynamic = 'force-dynamic';

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('name, cuisine, google_review_url, photo_urls')
    .eq('slug', slug)
    .single<Restaurant>();

  if (error && error.code !== 'PGRST116') {
    console.error('[slug-lookup] Supabase error for slug', slug, error);
  }

  after(() => logTap(slug, Boolean(restaurant)));

  if (!restaurant) {
    return (/* "Card not linked yet" fallback screen */);
  }

  return <Landing slug={slug} restaurant={restaurant} />;
}
```

**Resolution is 100% server-side.** It happens inside an `async` Server
Component — no client-side fetch, no SWR/React Query, no loading spinner for
the lookup itself. By the time HTML reaches the browser, the restaurant data
(or the "not linked" fallback) is already baked in.

`export const dynamic = 'force-dynamic'` disables Next's static/ISR caching
for this route, so every tap re-queries Supabase — deliberate, per the code
comment ("a tapped card should reflect current restaurant data").

**Full request lifecycle for `GET /r/<slug>`:**

1. Browser requests `/r/<slug>` (this URL is what's written to the NFC tag).
2. Next.js server runtime matches the dynamic segment, invokes the async
   Server Component, awaits `params` to get `slug`.
3. Server component queries Supabase `restaurants` table for that slug
   (anon key, single row).
4. `after()` schedules a fire-and-forget insert into `taps` (`event_type:
   'tap'`) — scheduled *after* the response is sent, so it never adds
   latency and never blocks/fails the page render even if Supabase is slow
   or down.
5. Branch:
   - **No row found** (`PGRST116` from `.single()`, i.e. 0 rows) → renders a
     static "🤔 Card not linked yet" screen. No redirect — same URL, different
     content.
   - **Any other Supabase error** (bad URL, RLS misconfig, network) → logged
     to console, but **still falls through to the same "not found" UI** (the
     code treats this as a real bug worth logging, but the user experience is
     identical to "not found" — no error page distinction was built).
   - **Row found** → renders `<Landing slug={slug} restaurant={restaurant} />`,
     a client component, passing the resolved data as props (no re-fetch on
     the client).
6. `Landing.tsx` (client-side from here) shows platform buttons. Each button
   press hits `/api/caption` or `/api/xhs/publish` with `{ slug, platform }`
   in the POST body — **both API routes redundantly re-resolve the slug
   against Supabase themselves** (they don't trust/reuse the page's earlier
   lookup, since they're invoked independently and statelessly).
7. Depending on platform:
   - **Xiaohongshu** → `/api/xhs/publish` generates a caption, calls the
     myaibot.vip bridge (or returns a mock URL in dev), gets back a `url`,
     and the client does `window.location.href = data.url` — a **client-side
     redirect** into the XHS app deep link.
   - **Instagram** → no network call at all; client just shows a fixed
     `/public/hardcode-ig.jpg` image and offers `navigator.share()`.
   - **Facebook / TikTok / Google** → `/api/caption` returns a text caption,
     shown in a copy box with a link to open the target site/app.

No middleware, no edge functions, no redirects at the HTTP/routing layer —
every "redirect" in this system is a client-side `window.location.href`
assignment triggered by a user tap, not a 30x response.

---

## 3. Data Model

Source: [supabase-schema.sql](supabase-schema.sql)

### `restaurants` — the slug table

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK, `gen_random_uuid()`) | |
| `slug` | `text` **`not null unique`** | **The slug key** — what `/r/[slug]` resolves against |
| `name` | `text not null` | |
| `cuisine` | `text not null` | e.g. "Sichuan" |
| `google_review_url` | `text`, nullable | optional direct review link |
| `created_at` | `timestamptz not null default now()` | |
| `photo_urls` | `text[]`, nullable | added via `alter table`; XHS needs ≥1 |
| `google_caption` | `text`, nullable | added via `alter table`; **PROTOTYPE** hardcoded caption override for the Google Review button |

Uniqueness: `slug` has a `unique` constraint (implicit unique index). No
explicit index beyond the PK and the unique constraint — fine at this scale
since lookups are single-row equality matches.

### `taps` — append-only event log

`id (uuid pk)`, `slug (text)`, `event_type (text, check in ('tap','caption'))`,
`platform (text, nullable — only for 'caption')`, `restaurant_found
(boolean)`, `created_at`. Indexed on `slug` and `created_at`.

### `xhs_publishes` — Xiaohongshu publish log

`id (uuid pk)`, `restaurant_id (uuid, fk → restaurants.id)`, `note_id (text,
nullable)`, `created_at`. Indexed on `restaurant_id`.

### The exact slug-fetch query

Page lookup ([app/r/[slug]/page.tsx](app/r/[slug]/page.tsx)):
```ts
const { data: restaurant, error } = await supabase
  .from('restaurants')
  .select('name, cuisine, google_review_url, photo_urls')
  .eq('slug', slug)
  .single<Restaurant>();
```

`/api/caption` re-runs an equivalent query selecting `name, cuisine,
google_caption`; `/api/xhs/publish` selects `id, name, cuisine, photo_urls`.
Each route selects only the columns it needs — no shared "get restaurant by
slug" helper exists (a minor duplication, notable for portability below).

### Client / RLS

[lib/supabase.ts](lib/supabase.ts): the client is built from `SUPABASE_URL` +
`SUPABASE_ANON_KEY` — **anon key, not service role**, and used **only in
server-side code** (route handlers / server components; comment explicitly
says "never imported into client components").

RLS is **on** for all three tables:
- `restaurants`: `select` policy `using (true)` → anyone (anon key) can read
  any row. No insert/update/delete policy → anon key cannot write.
- `taps`: `insert` policy `with check (true)` → anyone can append; no
  `select` policy → anon key can never read taps back.
- `xhs_publishes`: same shape as `taps` — insert-only for anon.

So the slug lookup is a fully public, unauthenticated read (by design — an
NFC tap has no login), while all logging tables are write-only from the
client's perspective.

---

## 4. Behaviour & Logic After Resolution

There is **no redirect-to-external-URL and no star-rating fork** at the
resolution step itself — resolution always renders the *same* page
(`Landing.tsx`) for any known slug. The branching happens **after** the user
picks a platform, entirely in `Landing.tsx` (client-side) + the two API
routes:

- **Xiaohongshu**: primary CTA. `publishXhs()` → `POST /api/xhs/publish` →
  server generates a `{title, content}` note via OpenAI, hands it plus
  `photo_urls[0]` to the myaibot.vip bridge → gets back a `url` → client does
  `window.location.href = url`, opening the XHS app with everything
  pre-filled. On any failure (including HTTP 402 insufficient balance) it
  falls back to the generic copy-to-clipboard flow instead of dead-ending.
- **Instagram**: no caption call at all — `openInstagram()` just flips UI
  state to show a hardcoded demo image (`/public/hardcode-ig.jpg`) and a
  "Share to Story" button that uses `navigator.share()` with the image file
  (falling back to the `instagram://story-camera` deep link, then a web
  fallback, if the Web Share API isn't available).
- **Facebook / TikTok**: currently **disabled** in the UI
  (`DISABLED_PLATFORMS` set in `Landing.tsx`) — buttons render but do
  nothing.
- **Google Review**: `POST /api/caption` with `platform: 'google'`. If the
  restaurant row has `google_caption` set, that exact string is returned
  verbatim (no OpenAI call — an explicit prototype shortcut for the demo).
  Otherwise falls through to normal AI generation. The caption is shown with
  a "Leave a Google review" link resolved via `resolveOpenUrl()` — the
  restaurant's `google_review_url` if set, else a generic Google search for
  `"<name> reviews"`.

**Stateful/side-effecting behaviour:**
- **Tap tracking**: one `taps` row per page view, fire-and-forget via
  `after()`, recording whether the slug matched a restaurant
  ([lib/log.ts](lib/log.ts) `logTap`).
- **Caption-generation tracking**: one `taps` row per successful caption
  generation, also fire-and-forget (`logCaption`), recorded *after* the
  caption response is already sent to the client.
- **XHS publish tracking**: one `xhs_publishes` row per successful bridge
  call, fire-and-forget (`logXhsPublish`), storing the restaurant id and the
  bridge's returned note id.
- **No rate limiting anywhere** — no per-slug or per-IP throttling on the
  page, `/api/caption`, or `/api/xhs/publish`.
- **No caching of the slug lookup**: `dynamic = 'force-dynamic'` explicitly
  forces a fresh Supabase query on every request; no ISR, no ISR revalidate
  tags, no in-memory cache.
- **Dev safety valve**: `DEV_MOCK_XHS=true` short-circuits the myaibot call
  entirely and returns a fake url, to avoid burning the metered credit
  balance while testing.

---

## 5. Coupling & Portability

**Everything the slug flow depends on:**
- **Supabase** (`@supabase/supabase-js`) — required for the slug→restaurant
  lookup itself, plus all three logging paths. This is a hard runtime
  dependency; there is no local/static fallback data source.
- **A server runtime capable of running Next.js Server Components and route
  handlers** — the slug lookup runs inside `async function RestaurantPage`,
  which only executes on a Node/Vercel serverless runtime, never in the
  browser.
- **Next's `after()`** (from `next/server`) — Vercel-specific post-response
  execution guarantee used for all fire-and-forget logging.
- **Env vars**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (slug lookup + logging),
  `OPENAI_API_KEY` (captions), `MYAIBOT_API_KEY` + `DEV_MOCK_XHS` (XHS
  publish only, not slug resolution itself).
- **npm packages**: `next`, `react`/`react-dom`, `@supabase/supabase-js`,
  `openai`.
- No middleware, no edge config, no external CDN dependency beyond Vercel's
  own hosting.

**What a plain static landing page CANNOT do on its own:**
- **The slug→restaurant lookup.** This is a privileged-enough, server-side
  Supabase query today (anon key, but still invoked server-side, never from
  the browser bundle). A static HTML page has no server code to run this at
  request time. it would need either:
  - a serverless/edge function (e.g. a single Vercel/Cloudflare function
    replicating `app/r/[slug]/page.tsx`'s query), or
  - the query moved fully client-side using the Supabase JS client with the
    anon key embedded in a public bundle (technically possible since RLS
    already permits public reads of `restaurants`, but this exposes the
    Supabase project URL/anon key to any visitor — currently the code
    explicitly avoids this by keeping the anon key server-side only).
- **`/api/caption` and `/api/xhs/publish`.** These *must* stay behind a
  server, full stop — they hold `OPENAI_API_KEY` and `MYAIBOT_API_KEY`,
  which the CLAUDE.md constraints say must never reach the client. A static
  site would call these as external API endpoints (e.g. hosted on Vercel
  functions), unchanged from today's contract (`POST {slug, platform}` →
  `{caption}` / `{url}`).
- **Fire-and-forget logging (`after()`).** Static hosts have no server
  runtime to run this in; it would need to become a direct client-side
  `fetch` to Supabase (anon insert-only policies already allow this) or move
  into whatever serverless function handles the lookup.
- **The "force fresh, no caching" guarantee.** A static page is inherently
  cached/CDN-served; to preserve "always reflect current restaurant data,"
  the data fetch (whether client-side JS or a function) must not be
  statically baked at build time — it must run per-visit.

**What CAN move to a static page largely as-is:**
- All of `Landing.tsx`'s UI/interaction logic (platform buttons, copy to
  clipboard, `navigator.share()`, iOS Safari photo-save handling, disabled
  platforms) — none of it touches Supabase or secrets directly; it only
  calls the two API routes and receives plain JSON.
- `lib/platforms.ts` (pure config + `resolveOpenUrl`) — no server
  dependency, could ship in the static bundle unchanged.

**Bottom line:** the only piece that is fundamentally "server-required" is
the slug resolution step itself (plus the two secret-holding API calls,
which already have to be off the static page today). Everything else in the
current architecture is already effectively a static SPA talking to two
small backend endpoints — porting means keeping (or re-hosting) a minimal
serverless function for slug lookup + logging + caption/XHS generation, and
replacing the Next.js page/route-handler shell around it.

---

## Request-Flow Diagram

```
NFC card
   │  (physical tap)
   ▼
GET https://<domain>/r/<slug>
   │
   ▼
┌───────────────────────────────────────────────────────────┐
│  Next.js server (Vercel serverless)                        │
│  app/r/[slug]/page.tsx  (Server Component, force-dynamic)  │
│                                                              │
│   1. await params → slug                                    │
│   2. supabase.from('restaurants')                            │
│         .select(name, cuisine, google_review_url, photo_urls)│
│         .eq('slug', slug).single()                           │
│   3. after(() => insert into taps {event_type:'tap', ...})  │  ← fire-and-forget,
│                                                              │     runs post-response
│   4. branch:                                                │
│        no row  ──────────────► render "Card not linked yet" │
│        row found ────────────► render <Landing/> with props │
└───────────────────────────────────────────────────────────┘
                     │ (row found)
                     ▼
        Browser renders Landing.tsx (client component)
        shows: 小红书 / Instagram / Facebook(off) / TikTok(off) / Google
                     │
   ┌─────────────────┼───────────────────────┬─────────────────────┐
   ▼                 ▼                       ▼                     ▼
 Xiaohongshu       Instagram              Facebook/TikTok        Google Review
   │                 │                    (disabled, no-op)         │
   ▼                 ▼                                              ▼
POST /api/       no network call —                          POST /api/caption
xhs/publish      shows hardcoded                             { slug, platform:
{ slug }         /hardcode-ig.jpg,                             'google' }
   │             navigator.share()                                  │
   ▼             or deep link                                       ▼
 server:                                                    server: re-fetch
 re-fetch restaurant                                        restaurant by slug,
 by slug (id, name,                                         if google_caption set
 cuisine, photo_urls)                                       → return verbatim,
   │                                                         else → OpenAI generate
   ▼                                                                 │
 generateCaption('xiaohongshu')                                      ▼
 (OpenAI gpt-4o-mini, JSON)                                  after(() => log
   │                                                          'caption' tap)
   ▼                                                                 │
 DEV_MOCK_XHS=true? ──yes──► return fake url                        ▼
   │no                                                       client shows caption
   ▼                                                         box + Copy + Open link
 POST myaibot.vip/api/rednote/publish
 { api_key, title, content, images }
   │
   ▼
 402 → insufficient_balance (client falls back to copy flow)
 200 → { data: { url, id } }
   │
   ▼
 after(() => insert xhs_publishes {restaurant_id, note_id})
   │
   ▼
 client: window.location.href = url   → XHS app opens, pre-filled, user taps publish
```
