// Shared WhatsApp helpers — safe to import from both client and server code.

/**
 * Turn a stored WhatsApp number into a wa.me link.
 *
 * wa.me accepts digits only: no "+", spaces, dashes or brackets. Restaurants
 * hand over numbers in whatever shape they write them on a signboard, so we
 * normalise rather than demanding one format at data-entry time.
 *
 * A leading "0" is a local Malaysian number (013-456 7890) and gets the 60
 * country code. Anything else is assumed to already carry its country code.
 * Store non-Malaysian numbers in full international form (e.g. 6591234567).
 *
 * `message` pre-fills the chat box. WhatsApp genuinely supports this via the
 * `text` parameter — unlike Instagram/Facebook, where no such pre-fill exists.
 * The customer still has to hit send, so nothing is sent on their behalf.
 *
 * Returns null when there's nothing usable, so callers can hide the button.
 */
export function waLink(
  raw: string | null | undefined,
  message?: string,
): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Local Malaysian format → international.
  if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;

  // Shortest plausible international number is ~8 digits; below that the value
  // is a typo or a placeholder and a wa.me link would just 404.
  if (digits.length < 8 || digits.length > 15) return null;

  const url = `https://wa.me/${digits}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}
