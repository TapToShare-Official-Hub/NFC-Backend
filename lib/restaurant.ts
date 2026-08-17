import { supabase } from '@/lib/supabase';

// Columns present since launch — these always exist.
const BASE = 'id, name, cuisine, google_review_url, photo_urls, google_caption';

// Columns added later. PostgREST fails the ENTIRE query if any selected column
// is missing, so folding these into BASE means a deploy that lands before its
// migration turns every live restaurant into "Card not linked yet". Fetching
// them separately makes an un-run migration degrade to "less colour in the
// caption" instead of an outage.
const OPTIONAL =
  'logo_url, whatsapp_number, facebook_url, neighbourhood, landmarks, signature_dishes, notes';

export interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string;
  google_review_url: string | null;
  photo_urls: string[] | null;
  google_caption: string | null;
  logo_url?: string | null;
  whatsapp_number?: string | null;
  facebook_url?: string | null;
  neighbourhood?: string | null;
  landmarks?: string | null;
  signature_dishes?: string[] | null;
  notes?: string | null;
}

/**
 * Load a restaurant by slug, tolerating columns that don't exist yet.
 * Returns null when the slug is genuinely unknown.
 */
export async function fetchRestaurant(
  slug: string,
): Promise<RestaurantRow | null> {
  const [base, optional] = await Promise.all([
    supabase.from('restaurants').select(BASE).eq('slug', slug).maybeSingle(),
    supabase.from('restaurants').select(OPTIONAL).eq('slug', slug).maybeSingle(),
  ]);

  if (base.error) {
    console.error('[restaurant] lookup failed for', slug, base.error.message);
    return null;
  }
  if (!base.data) return null;

  if (optional.error) {
    // Almost always 42703 (column does not exist) = migration not run yet.
    console.warn(
      '[restaurant] optional columns unavailable:',
      optional.error.message,
    );
  }

  return {
    ...(base.data as RestaurantRow),
    ...((optional.data ?? {}) as Partial<RestaurantRow>),
  };
}
