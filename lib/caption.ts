import OpenAI from 'openai';
import { buildPrompt } from '@/lib/prompt';
import type { PlatformId } from '@/lib/platforms';

// The exact model requested for this project.
const MODEL = 'gpt-4o-mini';

const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment

/** Xiaohongshu returns a structured note; every other platform returns text. */
export interface XhsCaption {
  title: string;
  content: string;
}

// Xiaohongshu weighted title length: Chinese/non-ASCII = 1, ASCII = 0.5.
function xhsTitleWeight(s: string): number {
  let weight = 0;
  for (const ch of s) {
    weight += ch.codePointAt(0)! < 128 ? 0.5 : 1;
  }
  return weight;
}

/**
 * Truncate a title so its weighted length never exceeds `max` (default 20).
 * Enforced in code regardless of what the model returns.
 */
export function truncateXhsTitle(s: string, max = 20): string {
  const title = s.trim();
  if (xhsTitleWeight(title) <= max) return title;

  let weight = 0;
  let out = '';
  for (const ch of title) {
    const w = ch.codePointAt(0)! < 128 ? 0.5 : 1;
    if (weight + w > max) break;
    weight += w;
    out += ch;
  }
  return out;
}

/**
 * Generate a caption for a platform, grounded only in the supplied restaurant
 * facts. Xiaohongshu resolves to a `{ title, content }` note (title truncated
 * to 20 weighted chars); all other platforms resolve to a single string.
 */
export async function generateCaption(
  platform: 'xiaohongshu',
  restaurant: { name: string; cuisine: string },
): Promise<XhsCaption>;
export async function generateCaption(
  platform: PlatformId,
  restaurant: { name: string; cuisine: string },
): Promise<string | XhsCaption>;
export async function generateCaption(
  platform: PlatformId,
  restaurant: { name: string; cuisine: string },
): Promise<string | XhsCaption> {
  const { system, user } = buildPrompt(platform, restaurant.name, restaurant.cuisine);

  if (platform === 'xiaohongshu') {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { title?: unknown; content?: unknown };
    const title = truncateXhsTitle(String(parsed.title ?? '').trim());
    const content = String(parsed.content ?? '').trim();

    if (!title || !content) {
      throw new Error('Xiaohongshu caption missing title or content.');
    }
    return { title, content };
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  return (completion.choices[0]?.message?.content ?? '').trim();
}
