# NFC Tap-to-Share MVP

Restaurants put NFC cards on tables. Customer taps → lands on a page → picks a
platform → gets an AI-written caption → copies it → posts it themselves.

## Hard constraints — do not violate

- **No platform pre-fill exists.** Instagram, Facebook, XHS, TikTok, and Google
  Reviews all have NO working way to pre-fill post text from a web page.
  Every platform is: copy to clipboard → open app → user pastes manually.
  Never add a "share API" that claims to pre-fill. It does not work.
- Xiaohongshu captions must be in Simplified Chinese, written natively —
  not translated-sounding English.
- Mobile-first. Every user is on a phone, one-handed, standing in a restaurant.
- Caption must appear in under 3 seconds. This is a live sales demo.
- Never block the redirect or the caption response on analytics writes.

## Out of scope (do not build)

Auth, dashboards, photo upload, photo library, billing, admin panel,
multi-language beyond zh/en, analytics UI.

## Stack

Next.js App Router · Vercel · Supabase (restaurants, taps) ·
OpenAI API (gpt-4o-mini)

## Env

OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY