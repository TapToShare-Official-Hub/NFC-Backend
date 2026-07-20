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

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, cuisine, google_review_url')
    .eq('slug', slug)
    .single<Restaurant>();

  // Log every tap, fire-and-forget, after the response is sent.
  after(() => logTap(slug, Boolean(restaurant)));

  if (!restaurant) {
    return (
      <main className="screen">
        <div className="center-card">
          <div className="big-emoji">🤔</div>
          <h1>Card not linked yet</h1>
          <p>
            This card isn&apos;t connected to a restaurant. If you&apos;re the
            owner, add a row with slug <code>{slug}</code> to your
            <code> restaurants</code> table.
          </p>
        </div>
      </main>
    );
  }

  return <Landing slug={slug} restaurant={restaurant} />;
}
