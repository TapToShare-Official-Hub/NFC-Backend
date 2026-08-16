'use client';

import { useEffect, useState } from 'react';
import {
  PLATFORMS,
  PLATFORM_MAP,
  resolveOpenUrl,
  type Platform,
  type PlatformId,
} from '@/lib/platforms';
import type { Restaurant } from '@/lib/supabase';
import { safeHttpUrl } from '@/lib/url';
import { waLink } from '@/lib/whatsapp';
import PlatformIcon from './PlatformIcon';

// WhatsApp is a contact channel, not a posting platform — it deliberately
// stays out of PLATFORMS so it never reaches caption generation.
function WhatsAppIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

interface Props {
  slug: string;
  restaurant: Restaurant;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

// Shown but inert — the button renders greyed out and tapping does nothing.
const DISABLED_PLATFORMS = new Set<PlatformId>([]);

// Not rendered as caption platforms. TikTok is switched off entirely; Facebook
// is still on the page but as a direct link to the restaurant's own page (see
// the Facebook button below), so it must not reach caption generation.
const HIDDEN_PLATFORMS = new Set<PlatformId>(['tiktok', 'facebook']);

// Pre-filled into the WhatsApp chat box. The customer still taps send.
const WA_MESSAGE = "Hello I'd like to make a reservation.";

// Opens the Instagram story composer directly. No content is passed — Instagram
// has no pre-fill; this only launches the app on the right screen.
const IG_STORY_DEEPLINK = 'instagram://story-camera';
const IG_STORY_WEB_FALLBACK = 'https://www.instagram.com/stories/camera/';

// PROTOTYPE: fixed demo image for Share to Story and Save Photo, instead of
// restaurant.photo_urls. Served from public/ so it's same-origin (no CORS to
// negotiate) and versioned with the code. JPEG rather than the WebP original:
// Instagram's share extension is unreliable with image/webp.
const SHARE_IMAGE_URL = '/hardcode-ig.jpg';

// PROTOTYPE: per-slug logo fallback so the pilot restaurant is branded without
// a DB round-trip. `restaurant.logo_url` wins when set — that's the path every
// future client should use; this map goes away once they're all seeded.
const FALLBACK_LOGOS: Partial<Record<string, string>> = {
  bunnywokandgrill: '/Bunny-Wok-Logo.webp',
};

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
    (p) => !HIDDEN_PLATFORMS.has(p.id) && (p.id !== 'xiaohongshu' || hasPhotos),
  );
  // Layout is declared explicitly rather than derived from PLATFORMS order, so
  // reordering that config can't silently reshuffle the page:
  //   row 1  Xiaohongshu (primary)
  //   row 2  Instagram + Google Review (paired)
  //   row 3  Facebook (full width)
  //   row 4  WhatsApp (full width)
  // Rows 3 and 4 are plain links to the restaurant's own page/number, not
  // caption platforms — they open Facebook and WhatsApp directly.
  const fileStem =
    restaurant.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'photo';
  const byId = (id: PlatformId) => platforms.find((p) => p.id === id);
  const xhs = byId('xiaohongshu');
  const pairRow = (['instagram', 'google'] as const)
    .map(byId)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
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

  const logoUrl = restaurant.logo_url ?? FALLBACK_LOGOS[slug] ?? null;
  // Both null for a missing, malformed or not-yet-migrated value → the button
  // is hidden rather than pointing at a generic homepage or a dead link.
  const whatsappUrl = waLink(restaurant.whatsapp_number, WA_MESSAGE);
  const facebookUrl = safeHttpUrl(restaurant.facebook_url);
  // One button shape for every platform, so the pair row and the full-width
  // rows can't drift apart visually.
  const renderPlatform = (p: Platform) => {
    const busy = isLoading && active === p.id;
    const off = DISABLED_PLATFORMS.has(p.id);
    return (
      <button
        key={p.id}
        type="button"
        className={`plat-btn plat-${p.id}${busy ? ' working' : ''}${
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
        <span className="plat-label">{p.label}</span>
        {busy && (
          <span
            className={`spinner${p.id === 'google' ? ' dark' : ''}`}
            aria-hidden
          />
        )}
      </button>
    );
  };

  const activePlatform = active ? PLATFORM_MAP[active] : null;
  const openUrl = active ? resolveOpenUrl(active, restaurant) : '#';

  return (
    <main className="screen">
      <header className="header">
        <p className="eyebrow">Loved your meal?</p>
        <h1 className="title">{restaurant.name}</h1>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brand-logo" src={logoUrl} alt={restaurant.name} />
        )}
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

        {pairRow.length > 0 && (
          <div className="grid">{pairRow.map(renderPlatform)}</div>
        )}

        {facebookUrl && (
          <a
            className="plat-btn plat-facebook"
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PlatformIcon id="facebook" />
            <span className="plat-label">Facebook</span>
          </a>
        )}

        {whatsappUrl && (
          <a
            className="plat-btn plat-whatsapp"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon />
            <span className="plat-label">WhatsApp</span>
          </a>
        )}
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
