import type { PlatformId } from '@/lib/platforms';

// Presentational only: recognisable brand marks as inline SVG (no dependency).
// Brand-filled buttons pass white via `currentColor`; Google keeps its true
// multicolour mark because that is how it is recognised (and reads on white).

export default function PlatformIcon({ id }: { id: PlatformId }) {
  switch (id) {
    case 'xiaohongshu':
      // Open "little red book".
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <path
            fill="currentColor"
            d="M11 4.8C10.1 4.1 8.9 3.7 7.6 3.7H3.2c-.4 0-.7.3-.7.7v13.4c0 .4.3.7.7.7h4.4c1.3 0 2.5.4 3.4 1.1V4.8zm2 15.5c.9-.7 2.1-1.1 3.4-1.1h4.4c.4 0 .7-.3.7-.7V5.1c0-.4-.3-.7-.7-.7h-4.4c-1.3 0-2.5.4-3.4 1.1v14.8z"
          />
        </svg>
      );

    case 'instagram':
      // Camera outline.
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <rect
            x="2.8"
            y="2.8"
            width="18.4"
            height="18.4"
            rx="5.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle
            cx="12"
            cy="12"
            r="4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="17.6" cy="6.4" r="1.35" fill="currentColor" />
        </svg>
      );

    case 'facebook':
      // Lowercase "f".
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <path
            fill="currentColor"
            d="M14.9 12.9h2.5l.5-3.3h-3V7.5c0-1 .3-1.7 1.7-1.7h1.5V2.9c-.7-.1-1.7-.2-2.7-.2-2.7 0-4.5 1.6-4.5 4.6v2.3H8.1v3.3h2.7v8h4.1v-8z"
          />
        </svg>
      );

    case 'tiktok':
      // Music note.
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <path
            fill="currentColor"
            d="M16.7 3c.4 2.3 1.9 4.1 4.3 4.4v3c-1.4.1-2.8-.3-4-1.1v6.4c0 3.7-3 6.6-6.7 6.6S3.6 19.4 3.6 15.7s3-6.6 6.7-6.6c.4 0 .8 0 1.2.1v3.2c-.4-.1-.8-.2-1.2-.2-1.9 0-3.4 1.6-3.4 3.5s1.5 3.5 3.4 3.5 3.5-1.6 3.5-3.5V3h2.9z"
          />
        </svg>
      );

    case 'google':
      // True multicolour "G".
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
          <path
            fill="#4285F4"
            d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7C21.7 18.7 23 15.8 23 12.3z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3C3.7 21.3 7.5 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.6 14.7c-.3-.8-.4-1.7-.4-2.7s.1-1.9.4-2.7v-3H1.8C1 8.9.6 10.4.6 12s.4 3.1 1.2 4.5l3.8-1.8z"
          />
          <path
            fill="#EA4335"
            d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.5 0 3.7 2.7 1.8 6.5l3.8 3c.9-2.8 3.4-4.7 6.4-4.7z"
          />
        </svg>
      );
  }
}
