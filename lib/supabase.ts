import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud at startup rather than producing confusing runtime errors later.
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill them in.',
  );
}

// Server-side only client (anon key). Never imported into client components.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});

export interface Restaurant {
  name: string;
  cuisine: string;
  google_review_url: string | null;
  photo_urls: string[] | null;
}
