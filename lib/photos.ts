import { supabase } from '@/lib/supabase';

// Photos handed to one post. 1 maximises posts from a fixed pool (90 photos =
// 90 posts); raising it to 3 makes carousels but cuts the pool to 30 posts.
export const PHOTOS_PER_POST = 1;

// true = least-recently-used rotation, the pool never runs dry. Correct for a
// small pool (a 6-photo trial). Set false once a client's pool is big enough
// that a customer seeing a repeated photo would look sloppy.
export const RECYCLE_PHOTOS = true;

/**
 * Take the next photo(s) for this restaurant, marking them used so customers
 * are handed different pictures.
 *
 * Returns [] when the pool is exhausted, and null when the pool isn't set up
 * at all — callers treat those differently: exhausted is a real end state,
 * un-migrated means fall back to whatever the caller used before.
 */
export interface ClaimedPhoto {
  url: string;
  /** What's in the picture. Null when the photo hasn't been labelled. */
  dish: string | null;
}

export async function claimPhotos(
  slug: string,
  count: number = PHOTOS_PER_POST,
): Promise<ClaimedPhoto[] | null> {
  // SKIP LOCKED returns nothing when every candidate row is momentarily locked
  // by a simultaneous tap. In recycle mode the pool can never truly be empty,
  // so an empty result there means contention, not exhaustion — retry rather
  // than telling the customer we've run out. Measured: 6 parallel claims on a
  // 6-photo pool produced 5 photos and one empty result.
  const attempts = RECYCLE_PHOTOS ? 3 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, error } = await supabase.rpc('claim_photos', {
      p_slug: slug,
      p_count: count,
      p_recycle: RECYCLE_PHOTOS,
    });

    if (error) {
      // 42883 = function does not exist → migration not run yet.
      console.warn('[photos] claim_photos unavailable:', error.message);
      return null;
    }

    const rows = (data as ClaimedPhoto[] | null) ?? [];
    if (rows.length) return rows;

    // Brief, growing pause so the competing transaction can commit.
    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }

  return [];
}

/** Best-effort: never let a release failure mask the original error. */
export async function releasePhotos(
  slug: string,
  urls: string[],
): Promise<void> {
  if (!urls.length) return;
  try {
    const { error } = await supabase.rpc('release_photos', {
      p_slug: slug,
      p_urls: urls,
    });
    if (error) console.error('[photos] release rejected:', error.message);
  } catch (err) {
    console.error('[photos] failed to release photos', err);
  }
}
