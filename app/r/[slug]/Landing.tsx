'use client';

import { useState } from 'react';
import {
  PLATFORMS,
  PLATFORM_MAP,
  resolveOpenUrl,
  type PlatformId,
} from '@/lib/platforms';
import type { Restaurant } from '@/lib/supabase';

interface Props {
  slug: string;
  restaurant: Restaurant;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function Landing({ slug, restaurant }: Props) {
  const [active, setActive] = useState<PlatformId | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate(platform: PlatformId) {
    setActive(platform);
    setStatus('loading');
    setCaption('');
    setCopied(false);

    try {
      const res = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, platform }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = (await res.json()) as { caption?: string };
      if (!data.caption) throw new Error('No caption');

      setCaption(data.caption);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / denied permission — fall back to a manual select.
      const range = document.getSelection();
      const el = document.querySelector('.caption-box');
      if (el && range) {
        range.selectAllChildren(el);
      }
    }
  }

  const activePlatform = active ? PLATFORM_MAP[active] : null;
  const openUrl = active ? resolveOpenUrl(active, restaurant) : '#';

  return (
    <main className="screen">
      <header className="header">
        <p className="eyebrow">Loved your meal?</p>
        <h1 className="title">{restaurant.name}</h1>
        <p className="subtitle">
          Share it in one tap — we&apos;ll write the caption.
        </p>
      </header>

      <p className="prompt">Where do you want to post?</p>

      <div className="buttons">
        {PLATFORMS.map((p) => {
          const isLoading = status === 'loading' && active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="platform-btn"
              style={{ ['--btn-color' as string]: p.color }}
              onClick={() => generate(p.id)}
              disabled={status === 'loading'}
            >
              <span className="emoji" aria-hidden>
                {p.emoji}
              </span>
              <span>{p.label}</span>
              {isLoading && <span className="spinner" aria-hidden />}
            </button>
          );
        })}
      </div>

      {status === 'error' && (
        <div className="error" role="alert">
          <p>Couldn&apos;t generate a caption. Please try again.</p>
          <button
            type="button"
            className="retry-btn"
            onClick={() => active && generate(active)}
          >
            Retry
          </button>
        </div>
      )}

      {status === 'done' && activePlatform && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <span className="emoji" aria-hidden>
              {activePlatform.emoji}
            </span>
            <span className="label">{activePlatform.label} caption</span>
          </div>

          <div className="caption-box">{caption}</div>

          <div className="actions">
            <button
              type="button"
              className={`action-btn primary${copied ? ' copied' : ''}`}
              onClick={copyCaption}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <a
              className="action-btn secondary"
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {activePlatform.openLabel}
            </a>
          </div>
        </section>
      )}

      <footer className="footer">Powered by Tap to Share</footer>
    </main>
  );
}
