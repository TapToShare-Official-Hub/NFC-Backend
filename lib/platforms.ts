// Shared platform config — safe to import from both client and server code.

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
  /** Static destination to open. `google` is resolved per-restaurant instead. */
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
    url: 'https://www.instagram.com',
    openLabel: 'Open Instagram',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    emoji: '👍',
    color: '#1877F2',
    url: 'https://www.facebook.com',
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

/** Where the "open" button should send the user for a given platform. */
export function resolveOpenUrl(
  id: PlatformId,
  restaurant: { name: string; google_review_url: string | null },
): string {
  if (id === 'google') {
    return (
      restaurant.google_review_url ||
      `https://www.google.com/search?q=${encodeURIComponent(
        restaurant.name + ' reviews',
      )}`
    );
  }
  return PLATFORM_MAP[id].url ?? 'https://www.google.com';
}
