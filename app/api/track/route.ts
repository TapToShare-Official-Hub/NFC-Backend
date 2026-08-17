import { NextResponse, after } from 'next/server';
import { logClick } from '@/lib/log';

// Buttons that exist on the landing page. WhatsApp and Facebook are contact
// links rather than caption platforms, so this list is deliberately wider than
// PlatformId. An allowlist keeps junk out of the analytics table — `platform`
// is a free text column with no foreign key.
const TRACKABLE = new Set([
  'xiaohongshu',
  'instagram',
  'facebook',
  'whatsapp',
  'google',
]);

/**
 * Fire-and-forget button tracking. Called via navigator.sendBeacon(), which
 * survives the page navigating away — the whole point, since Facebook and
 * WhatsApp leave immediately on tap.
 *
 * Always answers 204 without waiting on the database: the client is already
 * gone, and analytics must never be in the critical path.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { slug, platform } = (body ?? {}) as {
    slug?: unknown;
    platform?: unknown;
  };

  if (
    typeof slug !== 'string' ||
    !slug ||
    slug.length > 100 ||
    typeof platform !== 'string' ||
    !TRACKABLE.has(platform)
  ) {
    return new NextResponse(null, { status: 204 });
  }

  after(() => logClick(slug, platform));

  return new NextResponse(null, { status: 204 });
}
