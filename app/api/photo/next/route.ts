import { NextResponse } from 'next/server';
import { claimPhotos } from '@/lib/photos';

/**
 * Hands the caller the next photo from the restaurant's rotating pool.
 *
 * Used by the Instagram flow, which — unlike Xiaohongshu — can't publish for
 * the customer. It only needs a picture to put in the share sheet, so there is
 * no caption, no bridge call and nothing to release: the claim marks the photo
 * used the moment we hand it over.
 *
 * 404 when the restaurant has no pool, so the client keeps its existing
 * hardcoded demo image instead of showing a broken preview.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { slug } = (body ?? {}) as { slug?: unknown };
  if (typeof slug !== 'string' || !slug) {
    return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });
  }

  const claimed = await claimPhotos(slug, 1);

  // null = pool not set up; [] = pool exists but exhausted. Either way the
  // client falls back rather than dead-ending on a missing image.
  if (!claimed?.length) {
    return NextResponse.json({ error: 'no_photo' }, { status: 404 });
  }

  // Just the url — claimPhotos returns { url, dish } and nesting the whole
  // object here hands the client a non-string src.
  return NextResponse.json({ url: claimed[0].url });
}
