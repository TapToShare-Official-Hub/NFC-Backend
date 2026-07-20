import { NextResponse, after } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
import { isPlatformId } from '@/lib/platforms';
import { buildPrompt } from '@/lib/prompt';
import { logCaption } from '@/lib/log';

// The exact model requested for this project.
const MODEL = 'gpt-4o-mini';

const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment

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

  const { system, user } = buildPrompt(
    platform,
    restaurant.name,
    restaurant.cuisine,
  );

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const caption = (completion.choices[0]?.message?.content ?? '').trim();

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
