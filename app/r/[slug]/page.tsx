import { after } from 'next/server';
import { supabase, type Restaurant } from '@/lib/supabase';
import { logTap } from '@/lib/log';
import Landing from './Landing';

// Always render fresh — a tapped card should reflect current restaurant data.
export const dynamic = 'force-dynamic';

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Columns present since launch — these must always exist.
  const BASE_COLUMNS = 'name, cuisine, google_review_url, photo_urls';
  // Columns added later. PostgREST fails the ENTIRE query if any selected
  // column is missing, so folding these into BASE_COLUMNS means a deploy that
  // lands before its migration turns every live restaurant into "Card not
  // linked yet". Asking for them separately makes an un-run migration degrade
  // to "no logo, no WhatsApp/Facebook button" instead of taking the page down.
  const OPTIONAL_COLUMNS = 'logo_url, whatsapp_number, facebook_url';

  const [base, optional] = await Promise.all([
    supabase
      .from('restaurants')
      .select(BASE_COLUMNS)
      .eq('slug', slug)
      .single<Restaurant>(),
    supabase
      .from('restaurants')
      .select(OPTIONAL_COLUMNS)
      .eq('slug', slug)
      .maybeSingle<Partial<Restaurant>>(),
  ]);

  const { error } = base;
  if (optional.error) {
    // Almost always 42703 (column does not exist) = migration not run yet.
    console.warn('[slug-lookup] optional columns unavailable:', optional.error.message);
  }

  const restaurant = base.data
    ? { ...base.data, ...(optional.data ?? {}) }
    : null;

  // `.single()` returns PGRST116 when no row matches — that's a genuine
  // "unknown slug", so we fall through to the fallback below. Anything else
  // (bad URL, RLS, network) is a real failure and must not be silently
  // rendered as "card not linked yet".
  if (error && error.code !== 'PGRST116') {
    console.error('[slug-lookup] Supabase error for slug', slug, error);
  }

  // Log every tap, fire-and-forget, after the response is sent.
  after(() => logTap(slug, Boolean(restaurant)));

  if (!restaurant) {
    return (
      <main className="screen">
        <div className="center-card">
          <div className="big-emoji">🤔</div>
          <h1>Card not linked yet</h1>
        </div>
      </main>
    );
  }

  return <Landing slug={slug} restaurant={restaurant} />;
}
