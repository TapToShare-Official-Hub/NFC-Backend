import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
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

  // Look up the restaurant so the caption is grounded in real name + cuisine.
  const { data: restaurant, error: dbError } = await supabase
    .from('restaurants')
    .select('name, cuisine')
    .eq('slug', slug)
    .single();

  if (dbError || !restaurant) {
    return NextResponse.json(
      { error: 'Restaurant not found.' },
      { status: 404 },
    );
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
