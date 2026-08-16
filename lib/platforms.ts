// Shared platform config — safe to import from both client and server code.
// The Restaurant import is type-only, so this file still pulls in nothing at
// runtime (lib/supabase throws at module load when env vars are missing).
import type { Restaurant } from '@/lib/supabase';

export type PlatformId =
  | 'xiaohongshu'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'google';

export interface Platform {
  id: PlatformId;
  label: string;
  emoji: string;
  /** Brand color for the button. */
  color: string;
  /**
   * Static destination to open. `null` means "resolved per-restaurant from a
   * column on the restaurants row" — see resolveOpenUrl().
   */
  url: string | null;
  /** Label for the "open" button once a caption is generated. */
  openLabel: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'xiaohongshu',
    label: '小红书 Xiaohongshu',
    emoji: '📕',
    color: '#FF2442',
    url: 'https://www.xiaohongshu.com',
    openLabel: 'Open Xiaohongshu',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    emoji: '📸',
    color: '#E1306C',
    // Instagram shares via the OS share sheet (see Landing.tsx); this web URL
    // is only the no-app fallback.
    url: 'https://www.instagram.com/stories/camera/',
    openLabel: 'Open Instagram Story',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    emoji: '👍',
    color: '#1877F2',
    url: null, // resolved from restaurant.facebook_url
    openLabel: 'Open Facebook',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    emoji: '🎵',
    color: '#111111',
    url: 'https://www.tiktok.com',
    openLabel: 'Open TikTok',
  },
  {
    id: 'google',
    label: 'Google Review',
    emoji: '⭐',
    color: '#4285F4',
    url: null, // resolved from restaurant.google_review_url
    openLabel: 'Leave a Google review',
  },
];

export const PLATFORM_MAP: Record<PlatformId, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
) as Record<PlatformId, Platform>;

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && value in PLATFORM_MAP;
}

/**
 * Where the "open" button should send the user for a given platform.
 *
 * Per-restaurant destinations are columns on the restaurants row, reached via
 * the slug lookup — the slug selects the row, the row carries the links. Takes
 * the whole Restaurant so adding another customisable platform is a column
 * plus a branch, not a change to this signature.
 */
export function resolveOpenUrl(id: PlatformId, restaurant: Restaurant): string {
  if (id === 'google') {
    // Google is the one platform with a sane generic fallback: a search for the
    // restaurant still lands the user somewhere useful.
    return (
      restaurant.google_review_url ||
      `https://www.google.com/search?q=${encodeURIComponent(
        restaurant.name + ' reviews',
      )}`
    );
  }
  if (id === 'facebook') {
    // Currently unreachable from the landing page: Facebook renders as a
    // direct link to the restaurant's own page rather than as a caption
    // platform, so it never becomes the "active" platform. Kept for the case
    // where Facebook is put back in the caption flow.
    return restaurant.facebook_url || 'https://www.facebook.com';
  }
  return PLATFORM_MAP[id].url ?? 'https://www.google.com';
}
