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

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    // NOTE: `logo_url` is deliberately absent. PostgREST fails the whole query
    // if any selected column is missing, which turns a live restaurant into
    // "Card not linked yet". Add it here only once the column exists in prod
    // (see supabase-schema.sql); until then logos come from FALLBACK_LOGOS.
    .select('name, cuisine, google_review_url, photo_urls')
    .eq('slug', slug)
    .single<Restaurant>();

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
