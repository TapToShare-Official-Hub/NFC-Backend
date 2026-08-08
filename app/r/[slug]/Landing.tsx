'use client';

import { useEffect, useState } from 'react';
import {
  PLATFORMS,
  PLATFORM_MAP,
  resolveOpenUrl,
  type PlatformId,
} from '@/lib/platforms';
import type { Restaurant } from '@/lib/supabase';
import PlatformIcon from './PlatformIcon';

interface Props {
  slug: string;
  restaurant: Restaurant;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

// Temporarily switched off — tapping these does nothing for now.
const DISABLED_PLATFORMS = new Set<PlatformId>(['facebook', 'tiktok']);

// Opens the Instagram story composer directly. No content is passed — Instagram
// has no pre-fill; this only launches the app on the right screen.
const IG_STORY_DEEPLINK = 'instagram://story-camera';
const IG_STORY_WEB_FALLBACK = 'https://www.instagram.com/stories/camera/';

// PROTOTYPE: fixed demo image for Share to Story and Save Photo, instead of
// restaurant.photo_urls. Served from public/ so it's same-origin (no CORS to
// negotiate) and versioned with the code. JPEG rather than the WebP original:
// Instagram's share extension is unreliable with image/webp.
const SHARE_IMAGE_URL = '/hardcode-ig.jpg';

export default function Landing({ slug, restaurant }: Props) {
  const [active, setActive] = useState<PlatformId | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoHint, setPhotoHint] = useState('');
  // Pre-fetched so "Share to Story" can call navigator.share() synchronously —
  // Safari drops the user gesture if you await a fetch inside the handler.
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Xiaohongshu notes require an image; hide the button when there are none.
  const hasPhotos = (restaurant.photo_urls?.length ?? 0) > 0;
  const platforms = PLATFORMS.filter(
    (p) => p.id !== 'xiaohongshu' || hasPhotos,
  );
  // Layout groups (pure render derivation): XHS is the primary action, the
  // rest sit in a 2x2 grid.
  const fileStem =
    restaurant.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'photo';
  const xhs = platforms.find((p) => p.id === 'xiaohongshu');
  const others = platforms.filter((p) => p.id !== 'xiaohongshu');
  const isLoading = status === 'loading';

  // Warm the share image into a File on load. The share sheet only offers
  // Instagram when there's a file to hand it, and by the time the user taps
  // Share we need it already in memory — Safari drops the user gesture if you
  // await a fetch inside the handler. A failure here is silent: shareToStory()
  // degrades to the story-camera deep link.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(SHARE_IMAGE_URL);
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        const type = blob.type || 'image/jpeg';
        const ext = type.includes('png') ? 'png' : 'jpg';
        setPhotoFile(new File([blob], `${fileStem}.${ext}`, { type }));
      } catch {
        // No file — shareToStory() degrades to the deep link.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileStem]);

  // Tapping Xiaohongshu tries the direct-publish bridge first: on success we
  // redirect straight into the XHS app. Any failure (esp. 402 insufficient
  // balance) falls back to the copy-to-clipboard flow — never a dead end.
  async function publishXhs() {
    setActive('xiaohongshu');
    setStatus('loading');
    setCaption('');
    setCopied(false);
    setNotice('');
    setPhotoHint('');

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

  // Last resort: drop the user into the story camera with nothing attached. If
  // the app isn't installed the deep link does nothing, so we fall back to the
  // web composer once we're sure the page never went to the background (i.e.
  // the app never opened).
  function openStoryCamera() {
    let switched = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') switched = true;
    };
    document.addEventListener('visibilitychange', onHide);

    window.location.href = IG_STORY_DEEPLINK;

    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!switched && document.visibilityState === 'visible') {
        window.location.href = IG_STORY_WEB_FALLBACK;
      }
    }, 1200);
  }

  // True when the OS share sheet can take our photo. Without a file the sheet
  // has nothing Instagram will accept, so we don't offer the button at all.
  function canShareStory() {
    return (
      !!photoFile &&
      typeof navigator.share === 'function' &&
      !!navigator.canShare?.({ files: [photoFile] })
    );
  }

  // "Share to Story": hands the photo to the OS share sheet. Picking Instagram
  // there opens Instagram's own destination picker — Story, Reel or Post — so
  // the user chooses where it lands. No caption is involved: Instagram accepts
  // no text through the share sheet.
  async function shareToStory() {
    if (!photoFile || !canShareStory()) {
      setPhotoHint('Save the photo, then pick it in Instagram.');
      openStoryCamera();
      return;
    }

    try {
      await navigator.share({ files: [photoFile] });
      setPhotoHint('In Instagram, choose Story, Reel or Post.');
    } catch (err) {
      // The user backing out of the sheet is not an error.
      if ((err as Error)?.name === 'AbortError') return;
      console.error(err);
      openStoryCamera();
    }
  }

  // Instagram gets no caption at all — there's nothing to pre-fill and nothing
  // worth pasting, so tapping it skips /api/caption and goes straight to the
  // share panel.
  function openInstagram() {
    setActive('instagram');
    setStatus('done');
    setCaption('');
    setCopied(false);
    setNotice('');
    setPhotoHint('');
  }

  async function generate(platform: PlatformId) {
    setActive(platform);
    setStatus('loading');
    setCaption('');
    setCopied(false);
    setPhotoHint('');
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

  // iOS Safari ignores the anchor `download` attribute and blocks programmatic
  // blob downloads, so we can't force a file save there. Detect it and instead
  // open the image full-screen with a long-press hint. Everyone else gets a
  // real fetch-to-blob download (same-origin now, so nothing to negotiate).
  function isIosSafari() {
    const ua = navigator.userAgent;
    const iOS =
      /iP(hone|ad|od)/.test(ua) ||
      // iPadOS reports as desktop Safari; sniff touch + Mac instead.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  }

  async function savePhoto() {
    if (savingPhoto) return;
    setPhotoHint('');

    if (isIosSafari()) {
      window.open(SHARE_IMAGE_URL, '_blank', 'noopener,noreferrer');
      setPhotoHint('Long-press the photo, then tap “Save to Photos”.');
      return;
    }

    setSavingPhoto(true);
    try {
      const res = await fetch(SHARE_IMAGE_URL);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const safeName = restaurant.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.download = `${safeName || 'photo'}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch (err) {
      console.error(err);
      // Blob download failed (CORS/network) — open the image so the user can
      // still save it manually. Never a dead end.
      window.open(SHARE_IMAGE_URL, '_blank', 'noopener,noreferrer');
      setPhotoHint('Long-press the photo to save it.');
    } finally {
      setSavingPhoto(false);
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

      <div className={`buttons${isLoading ? ' is-loading' : ''}`}>
        {xhs && (
          <button
            type="button"
            className={`primary-btn${
              isLoading && active === 'xiaohongshu' ? ' working' : ''
            }`}
            onClick={() => publishXhs()}
            disabled={isLoading}
          >
            <PlatformIcon id="xiaohongshu" />
            <span className="label-zh">小红书</span>
            <span className="label-en">Xiaohongshu</span>
            {isLoading && active === 'xiaohongshu' && (
              <span className="spinner" aria-hidden />
            )}
          </button>
        )}

        <div className="grid">
          {others.map((p) => {
            const active_ = isLoading && active === p.id;
            const off = DISABLED_PLATFORMS.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`grid-btn plat-${p.id}${active_ ? ' working' : ''}${
                  off ? ' is-off' : ''
                }`}
                onClick={
                  off
                    ? undefined
                    : p.id === 'instagram'
                      ? openInstagram
                      : () => generate(p.id)
                }
                disabled={isLoading || off}
                aria-disabled={off || undefined}
              >
                <PlatformIcon id={p.id} />
                <span>{p.label}</span>
                {active_ && (
                  <span
                    className={`spinner${p.id === 'google' ? ' dark' : ''}`}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <div className="loading-note" aria-live="polite">
          <p>
            {active === 'xiaohongshu'
              ? '正在准备你的小红书笔记… Preparing your post…'
              : '正在生成文案… Writing your caption…'}
          </p>
          <div className="progress" aria-hidden />
        </div>
      )}

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
            <PlatformIcon id={activePlatform.id} />
            <span className="label">
              {activePlatform.id === 'instagram'
                ? `${activePlatform.label} photo`
                : `${activePlatform.label} caption`}
            </span>
          </div>

          {/* Instagram gets no caption — just the photo and the share sheet. */}
          {activePlatform.id === 'instagram' ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="share-preview"
                src={SHARE_IMAGE_URL}
                alt="The photo you're about to share"
              />
              <div className="actions">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={shareToStory}
                >
                  Share to Story
                </button>
              </div>
              <p className="photo-hint">
                Pick Instagram in the share sheet, then choose Story, Reel or
                Post.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}

          <button
            type="button"
            className="action-btn save-photo"
            onClick={savePhoto}
            disabled={savingPhoto}
          >
            {savingPhoto ? 'Saving…' : '⬇ Save Photo'}
          </button>
          {photoHint && <p className="photo-hint">{photoHint}</p>}
        </section>
      )}

      <footer className="footer">Powered by Tap to Share</footer>
    </main>
  );
}
