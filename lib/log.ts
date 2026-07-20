import { supabase } from '@/lib/supabase';
import type { PlatformId } from '@/lib/platforms';

// All logging is best-effort. It must never throw into the request path —
// callers schedule these via `after()` so they run after the response is sent.

export async function logTap(slug: string, found: boolean): Promise<void> {
  try {
    await supabase.from('taps').insert({
      slug,
      event_type: 'tap',
      restaurant_found: found,
    });
  } catch (err) {
    console.error('[log] failed to record tap', err);
  }
}

export async function logCaption(
  slug: string,
  platform: PlatformId,
): Promise<void> {
  try {
    await supabase.from('taps').insert({
      slug,
      event_type: 'caption',
      platform,
      restaurant_found: true,
    });
  } catch (err) {
    console.error('[log] failed to record caption', err);
  }
}
