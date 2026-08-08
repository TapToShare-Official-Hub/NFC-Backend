import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Instagram story canvas. Anything else gets letterboxed by the app.
const WIDTH = 1080;
const HEIGHT = 1920;

// Fallback card colours, used when the restaurant has no photo.
const GRADIENT_FROM = '#4f46e5';
const GRADIENT_TO = '#9333ea';

/**
 * Renders the 1080x1920 graphic the user shares to their Instagram story:
 * the restaurant photo full-bleed, with a scrim and the restaurant's name and
 * location burned in. Restaurants without a photo get a gradient card instead.
 *
 * GET so the result is cacheable and can be used directly as an <img> src.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });
  }

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('name, cuisine, location, photo_urls')
    .eq('slug', slug)
    .single();

  if (error || !restaurant) {
    return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
  }

  const photoUrl = restaurant.photo_urls?.[0] ?? null;
  // No dedicated location on most rows yet — cuisine reads fine in the badge.
  const badge = restaurant.location || restaurant.cuisine;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: '100%',
          height: '100%',
          position: 'relative',
          // Only shows through when there's no photo to cover it.
          backgroundImage: `linear-gradient(135deg, ${GRADIENT_FROM}, ${GRADIENT_TO})`,
        }}
      >
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Scrim — keeps the white text legible over an unpredictable photo. */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '58%',
            backgroundImage:
              'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.88))',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            padding: '0 90px 260px',
          }}
        >
          {badge && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                color: GRADIENT_FROM,
                borderRadius: 999,
                padding: '18px 36px',
                marginBottom: 36,
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              📍 {badge.toUpperCase()}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: 88,
              fontWeight: 700,
              lineHeight: 1.1,
              // Belt and braces over the scrim on very bright photos.
              textShadow: '0 4px 24px rgba(0,0,0,0.45)',
            }}
          >
            {restaurant.name}
          </div>

          {!photoUrl && restaurant.cuisine && (
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.85)',
                fontSize: 40,
                marginTop: 24,
              }}
            >
              {restaurant.cuisine}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 120,
            left: 90,
            color: 'rgba(255,255,255,0.75)',
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          Powered by Tap to Share
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Without this the pin renders as tofu — satori has no emoji font.
      emoji: 'noto',
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  );
}
