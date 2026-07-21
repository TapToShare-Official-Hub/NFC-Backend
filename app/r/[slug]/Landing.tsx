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
  const [notice, setNotice] = useState('');

  // Xiaohongshu notes require an image; hide the button when there are none.
  const hasPhotos = (restaurant.photo_urls?.length ?? 0) > 0;
  const platforms = PLATFORMS.filter(
    (p) => p.id !== 'xiaohongshu' || hasPhotos,
  );

  // Tapping Xiaohongshu tries the direct-publish bridge first: on success we
  // redirect straight into the XHS app. Any failure (esp. 402 insufficient
  // balance) falls back to the copy-to-clipboard flow — never a dead end.
  async function publishXhs() {
    setActive('xiaohongshu');
    setStatus('loading');
    setCaption('');
    setCopied(false);
    setNotice('');

    try {
      const res = await fetch('/api/xhs/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error('No url');

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setNotice(
        "Couldn't open Xiaohongshu directly — copy the caption below and paste it in the app.",
      );
      await generate('xiaohongshu');
    }
  }

  async function generate(platform: PlatformId) {
    setActive(platform);
    setStatus('loading');
    setCaption('');
    setCopied(false);
    // Keep the fallback notice when this is the XHS copy-to-clipboard fallback;
    // clear any stale notice when the user taps a different platform.
    if (platform !== 'xiaohongshu') setNotice('');

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
        {platforms.map((p) => {
          const isLoading = status === 'loading' && active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="platform-btn"
              style={{ ['--btn-color' as string]: p.color }}
              onClick={() =>
                p.id === 'xiaohongshu' ? publishXhs() : generate(p.id)
              }
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

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

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
