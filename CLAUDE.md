# NFC Tap-to-Share MVP

Restaurants put NFC cards on tables. Customer taps → lands on a page → picks a
platform → gets an AI-written caption → copies it → posts it themselves.

## Hard constraints — do not violate

- **Xiaohongshu HAS a working pre-fill path** via the myaibot.vip bridge API
  (verified working on a Malaysian-installed XHS app). Flow: POST content to
  their /api/rednote/publish → get back a `url` → redirect the user to it →
  they tap publish → XHS app opens with title, body and image pre-filled.
- **Instagram, Facebook, TikTok, Google Reviews have NO pre-fill.** These stay
  copy-to-clipboard forever. Never add a "share API" for them — it does not exist.
- XHS notes REQUIRE at least one image. Text-only notes are impossible.
- XHS title max 20 chars (Chinese counts 1, English/digits 0.5). Enforce in code.
- XHS body max 1000 chars. Images min 720×960. No GIF or Live Photo.
- Xiaohongshu captions in Simplified Chinese, written natively.
- Caption generation must use ONLY supplied restaurant facts. Never infer
  cuisine lineage (Teochew vs Hakka etc) and never invent menu items.
- Mobile-first, one-handed, standing in a restaurant.
- Never block responses on analytics writes.
- The myaibot API key is metered and server-side only. Never expose to client.

## Out of scope (do not build)

Auth, dashboards, photo upload, photo library, billing, admin panel,
multi-language beyond zh/en, analytics UI.

## Stack

Next.js App Router · Vercel · Supabase (restaurants, taps) ·
OpenAI API (gpt-4o-mini) · myaibot.vip (XHS pre-fill bridge)

## Env

OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, MYAIBOT_API_KEY, DEV_MOCK_XHS

DEV_MOCK_XHS=true makes /api/xhs/publish return a fake url without calling
myaibot — keep it on in dev so nobody burns the limited credit balance.