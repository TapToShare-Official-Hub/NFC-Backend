/**
 * Normalise a restaurant-supplied link into something safe to put in an href.
 *
 * These values are typed into Supabase by hand, so they arrive in whatever
 * shape someone pasted: with or without a protocol, occasionally with stray
 * whitespace. A bare "facebook.com/x" in an href would resolve as a *relative*
 * path and send the customer to /r/<slug>/facebook.com/x, so a missing
 * protocol is added rather than trusted.
 *
 * Only http(s) survives: anything else (javascript:, data:) is rejected, so a
 * bad value in the database can't become script execution on the page.
 *
 * Returns null when there's nothing usable, so callers can hide the button.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
