import { NextResponse, after } from 'next/server';
import { fetchRestaurant } from '@/lib/restaurant';
import { isPlatformId } from '@/lib/platforms';
import { generateCaption } from '@/lib/caption';
import { logCaption } from '@/lib/log';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { slug, platform } = (body ?? {}) as {
    slug?: string;
    platform?: string;
  };

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });
  }
  if (!isPlatformId(platform)) {
    return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
  }

  // Grounding facts. Optional columns (location, signature dishes, notes) come
  // back only once their migration has run; without them the caption is still
  // generated, just with less to work with.
  const restaurant = await fetchRestaurant(slug);

  if (!restaurant) {
    return NextResponse.json(
      { error: 'Restaurant not found.' },
      { status: 404 },
    );
  }

  // PROTOTYPE: hardcoded caption, remove for multi-restaurant.
  // Google Review serves the restaurant's stored google_caption verbatim (no
  // OpenAI call) when it's set; a null column falls through to generation.
  if (platform === 'google' && restaurant.google_caption) {
    after(() => logCaption(slug, platform));
    return NextResponse.json({ caption: restaurant.google_caption });
  }

  try {
    const result = await generateCaption(platform, restaurant);

    // Xiaohongshu generation is structured; flatten it into one copyable
    // string so the { caption } contract and the copy-to-clipboard client
    // stay unchanged. Every other platform already returns a string.
    const caption =
      typeof result === 'string'
        ? result
        : `${result.title}\n\n${result.content}`;

    if (!caption) {
      return NextResponse.json(
        { error: 'Empty caption returned.' },
        { status: 502 },
      );
    }

    // Fire-and-forget: log after the response is sent, never blocking it.
    after(() => logCaption(slug, platform));

    return NextResponse.json({ caption });
  } catch (err) {
    console.error('[caption] OpenAI request failed', err);
    return NextResponse.json(
      { error: 'Could not generate a caption right now.' },
      { status: 502 },
    );
  }
}
