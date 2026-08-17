import { supabase } from '@/lib/supabase';
import type { PlatformId } from '@/lib/platforms';

// All logging is best-effort. It must never throw into the request path —
// callers schedule these via `after()` so they run after the response is sent.
//
// NOTE: supabase-js RESOLVES with an `error` field rather than throwing, so a
// try/catch alone silently swallows every failure. That is how a missing
// xhs_publishes table went unnoticed. `record()` inspects the returned error,
// and try/catch is kept only for genuine transport-level throws.
async function record(
  what: string,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from('taps').insert(row);
    if (error) console.error(`[log] ${what} rejected:`, error.message);
  } catch (err) {
    console.error(`[log] ${what} threw`, err);
  }
}

export async function logTap(slug: string, found: boolean): Promise<void> {
  await record('tap', {
    slug,
    event_type: 'tap',
    restaurant_found: found,
  });
}

export async function logCaption(
  slug: string,
  platform: PlatformId,
): Promise<void> {
  await record('caption', {
    slug,
    event_type: 'caption',
    platform,
    restaurant_found: true,
  });
}

/**
 * Records that a platform button was pressed. Distinct from 'caption', which
 * only fires when a caption is successfully generated — a click is intent, a
 * caption is a result, and mixing them undercounts every platform that doesn't
 * generate a caption (Instagram, Facebook, WhatsApp).
 */
export async function logClick(slug: string, platform: string): Promise<void> {
  await record('click', {
    slug,
    event_type: 'click',
    platform,
    restaurant_found: true,
  });
}

export async function logXhsPublish(
  restaurantId: string,
  noteId: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('xhs_publishes').insert({
      restaurant_id: restaurantId,
      note_id: noteId,
    });
    if (error) console.error('[log] xhs publish rejected:', error.message);
  } catch (err) {
    console.error('[log] xhs publish threw', err);
  }
}
