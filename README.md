# Tap to Share — NFC caption generator for restaurants

A mobile-first Next.js (App Router) app. A customer taps an NFC card, lands on
`/r/[slug]`, picks a platform, and gets an AI-written caption they can copy and
paste — then opens the target app to post it. Every tap and every caption
generation is logged to Supabase.

## How it works

1. Customer taps an NFC card → `/r/[slug]`.
2. The server looks the slug up in the Supabase `restaurants` table (name + cuisine).
   - Unknown slug → a friendly "card not linked yet" page.
3. The landing page shows 5 buttons: Xiaohongshu, Instagram, Facebook, TikTok, Google Review.
4. Tapping a button `POST`s `{ slug, platform }` to `/api/caption`.
5. That route calls Claude (`claude-haiku-4-5-20251001`) to write a platform-appropriate
   caption — **Xiaohongshu in Simplified Chinese**, everything else in English.
6. The caption appears in a box with a big **Copy** button and a button that opens
   the target app/site in a new tab.
7. Taps and caption generations are logged to the Supabase `taps` table,
   fire-and-forget (via Next's `after()`), never blocking the response.

## Tech

- Next.js 15 (App Router) + React 19 + TypeScript
- `@anthropic-ai/sdk` for captions
- `@supabase/supabase-js` (anon key) for lookups + logging

---

## 1. Prerequisites

- Node.js 18.18+ (Node 20+ recommended)
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## 2. Set up the database

In the Supabase dashboard → **SQL Editor** → **New query**, paste the contents of
[`supabase-schema.sql`](./supabase-schema.sql) and run it. This creates the
`restaurants` and `taps` tables, row-level-security policies, and two demo rows
(`golden-dragon`, `nonna-pizza`).

To add your own restaurant, insert a row:

```sql
insert into restaurants (slug, name, cuisine, google_review_url)
values ('my-cafe', 'My Café', 'brunch', null);
```

Point an NFC card at `https://<your-domain>/r/my-cafe`.

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Variable            | Where to find it                                                     |
| ------------------- | ------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic Console → Settings → API Keys                             |
| `SUPABASE_URL`      | Supabase → Project Settings → Data API → Project URL                 |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` `public`             |

These are server-side only (no `NEXT_PUBLIC_` prefix) and are never sent to the browser.

## 4. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000/r/golden-dragon> (or `/r/nonna-pizza`). Tap a
platform button, copy the caption, and confirm rows appear in the Supabase
`taps` table.

> Visiting `/` shows a short explainer — the real flow is always under `/r/[slug]`.

---

## 5. Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com/new), **Import** the repository. Vercel detects
   Next.js automatically — no build settings to change.
3. Under **Settings → Environment Variables**, add all three variables from
   `.env.local` (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) for the
   Production (and Preview) environments.
4. **Deploy.**
5. Program your NFC cards to `https://<your-vercel-domain>/r/<slug>`.

The fire-and-forget logging uses Next.js `after()`, which Vercel keeps alive
after the response is sent — so logs land reliably without slowing the page.

---

## Project structure

```
app/
  layout.tsx              Root layout + mobile viewport
  globals.css             Mobile-first styles
  page.tsx                Explainer for the bare "/" route
  r/[slug]/
    page.tsx              Server component: lookup + tap logging + fallback
    Landing.tsx           Client component: buttons, caption box, copy/open
  api/caption/route.ts    Anthropic caption generation + caption logging
lib/
  supabase.ts             Supabase client (anon key)
  platforms.ts            The 5 platforms + open-URL resolution
  prompt.ts               Per-platform prompt builder (Chinese for Xiaohongshu)
  log.ts                  Fire-and-forget tap/caption inserts
supabase-schema.sql       Table definitions + RLS + seed data
```

## Notes & customization

- **Google review link:** set `google_review_url` on the restaurant row to your
  Google "write a review" link. If it's empty, the button falls back to a Google
  search for `"<name> reviews"`.
- **Model:** the caption route uses `claude-haiku-4-5-20251001`. Change it in
  `app/api/caption/route.ts` if needed.
- **Tone:** tweak per-platform prompts in `lib/prompt.ts`.
- **Out of scope (by design):** no auth, no dashboard, no photo upload.
