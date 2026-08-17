import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateCaption } from '@/lib/caption';
import { logXhsPublish } from '@/lib/log';
import { PHOTOS_PER_POST, claimPhotos, releasePhotos } from '@/lib/photos';

const MYAIBOT_ENDPOINT = 'https://www.myaibot.vip/api/rednote/publish';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { slug } = (body ?? {}) as { slug?: string };
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });
  }

  const { data: restaurant, error: dbError } = await supabase
    .from('restaurants')
    .select('id, name, cuisine, photo_urls')
    .eq('slug', slug)
    .single();

  if (dbError || !restaurant) {
    return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
  }

  // Claim from the rotating pool first. A null result means the pool isn't set
  // up yet, so we fall back to the legacy single photo rather than breaking.
  const claimed = await claimPhotos(slug);
  const usingPool = claimed !== null;
  const photoUrls =
    claimed && claimed.length
      ? claimed
      : usingPool
        ? []
        : restaurant.photo_urls?.slice(0, PHOTOS_PER_POST) ?? [];

  // Pool ran dry: every photo has been posted. Distinct status so the client
  // falls back to copy-to-clipboard instead of showing a generic failure.
  if (usingPool && !photoUrls.length) {
    console.warn('[xhs/publish] photo pool exhausted for', slug);
    return NextResponse.json({ error: 'photos_exhausted' }, { status: 409 });
  }

  // Xiaohongshu notes require at least one image. The button is hidden client
  // side when there are none, so this is a defensive 400, not the happy path.
  if (!photoUrls.length) {
    return NextResponse.json(
      { error: 'Restaurant has no photos for Xiaohongshu.' },
      { status: 400 },
    );
  }

  let title: string;
  let content: string;
  try {
    ({ title, content } = await generateCaption('xiaohongshu', restaurant));
  } catch (err) {
    console.error('[xhs/publish] caption generation failed', err);
    // Nothing was published, so the photos must go back in the pool.
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json(
      { error: 'Could not generate a caption right now.' },
      { status: 502 },
    );
  }

  // DEV SAFETY: skip the metered myaibot call entirely and hand back a fake
  // url. Default-on in .env.local.example so nobody burns credits by accident.
  if (process.env.DEV_MOCK_XHS === 'true') {
    after(() => logXhsPublish(restaurant.id, 'mock'));
    return NextResponse.json({
      url: `https://www.xiaohongshu.com/?mock=1&slug=${encodeURIComponent(slug)}`,
      photos: photoUrls,
    });
  }

  const apiKey = process.env.MYAIBOT_API_KEY;
  if (!apiKey) {
    console.error('[xhs/publish] MYAIBOT_API_KEY is not set');
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json(
      { error: 'Publishing is not configured.' },
      { status: 502 },
    );
  }

  let resp: Response;
  try {
    resp = await fetch(MYAIBOT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        type: 'normal',
        title,
        content,
        images: photoUrls,
      }),
    });
  } catch (err) {
    console.error('[xhs/publish] myaibot request failed', err);
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json({ error: 'Publish bridge unreachable.' }, { status: 502 });
  }

  // Insufficient balance — surface a distinct status so the client can fall
  // back to copy-to-clipboard with the right message.
  if (resp.status === 402) {
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json({ error: 'insufficient_balance' }, { status: 402 });
  }
  if (!resp.ok) {
    console.error('[xhs/publish] myaibot returned', resp.status);
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json({ error: 'Publish failed.' }, { status: 502 });
  }

  // myaibot nests the result under `data`: url at data.url, note id at data.id.
  const payload = (await resp.json().catch(() => null)) as
    | { data?: { url?: string; id?: string } }
    | null;
  const url = payload?.data?.url;
  if (!url) {
    console.error('[xhs/publish] myaibot response missing data.url');
    if (usingPool) await releasePhotos(slug, photoUrls);
    return NextResponse.json({ error: 'Publish failed.' }, { status: 502 });
  }

  const noteId = payload?.data?.id ?? null;
  after(() => logXhsPublish(restaurant.id, noteId));

  // Return only the redirect url — never the api_key or the qrcode.
  return NextResponse.json({ url });
}
