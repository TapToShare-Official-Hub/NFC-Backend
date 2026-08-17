import type { PlatformId } from '@/lib/platforms';

interface Prompt {
  system: string;
  user: string;
}

/** Everything the model is allowed to know. Anything absent is simply omitted
 *  — the model must never fill a gap with an invention. */
export interface CaptionFacts {
  name: string;
  cuisine: string;
  neighbourhood?: string | null;
  landmarks?: string | null;
  /** What is actually in the photo being posted. When set, the caption must
   *  describe THIS and nothing else as the thing that was eaten. */
  featured_dish?: string | null;
  signature_dishes?: string[] | null;
  notes?: string | null;
}

/**
 * Rotating angles. Two customers tapping the same button on the same day
 * should not get near-identical captions, and temperature alone doesn't
 * achieve that — the model gravitates to the same "best" opening every time.
 * Forcing a different lens per request is what actually varies the output.
 */
const ANGLES_EN = [
  'Lead with one specific dish and what it tastes like.',
  'Lead with the moment — who you came with and why.',
  'Lead with the neighbourhood, like a local tipping off a friend.',
  'Lead with a landmark, the way you would give someone directions.',
  'Lead with an honest reaction, as if mid-meal.',
  'Lead with what you would order next time.',
];

const ANGLES_ZH = [
  '从某一道具体的菜切入，写出口感和细节。',
  '从当下的场景切入：和谁一起来、为什么来。',
  '从地点切入，像本地人跟朋友安利一家店。',
  '从地标切入，像给朋友指路那样说明位置。',
  '从真实的第一反应切入，像正在吃的时候随手发的。',
  '从"下次还想点什么"切入。',
];

/** The phrases that make a caption read as machine-written. */
const BANNED_EN =
  'Never use: "nestled in", "hidden gem", "a symphony of", "burst of flavour", ' +
  '"culinary journey", "foodie heaven", "must-try", "look no further", ' +
  '"whether you\'re", "elevate", "indulge in".';

const BANNED_ZH =
  '禁止使用这些烂大街的表达：绝绝子、YYDS、人间美味、舌尖上的、不容错过、' +
  '强烈安利、宝藏小店、天花板、爱了爱了。';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * The first entry is the restaurant's signature. It should appear more often
 * than the rest — it is what they want known — but not every time, or captions
 * stop varying. Roughly one in three.
 */
function pickDish(dishes: string[]): string {
  if (dishes.length === 1) return dishes[0];
  return Math.random() < 0.35 ? dishes[0] : pick(dishes.slice(1));
}

/** Only the facts that actually exist, as a plain list the model can lean on. */
function factLines(f: CaptionFacts, zh = false): string {
  const lines: string[] = [];
  lines.push(zh ? `餐厅名：${f.name}` : `Restaurant: ${f.name}`);
  lines.push(zh ? `菜系：${f.cuisine}` : `Cuisine: ${f.cuisine}`);

  if (f.neighbourhood) {
    lines.push(zh ? `地点：${f.neighbourhood}` : `Location: ${f.neighbourhood}`);
  }

  if (f.landmarks) {
    lines.push(zh ? `附近地标：${f.landmarks}` : `Nearby landmarks: ${f.landmarks}`);
  }

  const dishes = f.signature_dishes?.filter(Boolean) ?? [];

  // The photo decides what was eaten. Only when a photo is unlabelled do we
  // fall back to rotating a menu item, and even then the caption is told not
  // to describe how it looked.
  const eaten = f.featured_dish ?? (dishes.length ? pickDish(dishes) : null);
  if (eaten) {
    lines.push(
      zh
        ? `照片里的菜（正文要写的就是这道）：${eaten}`
        : `Dish in the photo (write about THIS one): ${eaten}`,
    );
  }

  // Everything else is menu knowledge, not something they ate — good for a
  // "they're also known for…" aside, which is how real recommendations read.
  const others = dishes.filter((d) => d !== eaten);
  if (others.length) {
    const mention = others.slice(0, 3).join('、');
    lines.push(
      zh
        ? `店里其他招牌（只能当作"听说/他们家还有"提一句，不能说你吃过）：${mention}`
        : `Other things they are known for (mention only as "they also do…", ` +
          `never as something you ate): ${others.slice(0, 3).join(', ')}`,
    );
  }

  if (f.notes) {
    lines.push(zh ? `其他信息：${f.notes}` : `Other details: ${f.notes}`);
  }

  return lines.join('\n');
}

/**
 * Build the system + user prompt for a caption.
 * Xiaohongshu captions are written in Simplified Chinese; everything else in English.
 */
export function buildPrompt(
  platform: PlatformId,
  facts: CaptionFacts,
): Prompt {
  const en = factLines(facts);
  const zh = factLines(facts, true);

  switch (platform) {
    case 'xiaohongshu':
      return {
        system:
          '你是一个普通的小红书用户，刚刚吃完一顿饭，随手发一条笔记。' +
          '你不是文案写手，也不是广告号——写得像真人，可以有口语、有停顿、有个人偏好。' +
          '你只输出一个 JSON 对象，格式为 {"title": "...", "content": "..."}，' +
          '不要加任何解释、markdown 代码块或前后缀。',
        user:
          `根据以下真实信息写一条小红书笔记：\n${zh}\n\n` +
          `这次的切入角度：${pick(ANGLES_ZH)}\n\n` +
          '要求：\n' +
          '- 全部使用简体中文；地名保留原文写法，不要自己翻译或音译\n' +
          '- 只能使用上面列出的信息。没写的菜品、食材、价格、故事一律不能编\n' +
          '- 菜名和地标必须照抄原文，不要翻译、改写或自己描述方位关系。' +
          '与其写错位置，不如只提一个地标的名字\n' +
          '- 只能描述"照片里的菜"的口感和样子。其他招牌菜最多用' +
          '"他们家好像还有…""听说…也很有名"这种口气带一句，绝对不能写成你吃过\n' +
          '- title：一个像真人会写的短标题（最多约 18 个汉字），不要标题党套路\n' +
          '- content：2-4 句，像发给朋友一样自然，emoji 少而准（0-3 个）\n' +
          '- 结尾放 4-6 个话题标签（#号），其中至少一个跟地点或菜系相关\n' +
          `- ${BANNED_ZH}\n` +
          '- 严格只返回 JSON 对象，不要有多余文字',
      };

    case 'instagram':
      return {
        system:
          'You are a real person posting about a meal you just had — not a ' +
          'copywriter and not a brand account. Write the way someone actually ' +
          'captions a photo: short, specific, a little offhand. Output only the ' +
          'caption text — no explanations, no quotation marks, no preamble.',
        user:
          `Write an Instagram caption using only these facts:\n${en}\n\n` +
          `Angle for this one: ${pick(ANGLES_EN)}\n\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Invent nothing. No dishes, prices or stories beyond the facts above\n' +
          '- Copy dish names and landmark names exactly. Do not restate which ' +
          'side of the road something is on — naming one landmark is enough\n' +
          '- Only the dish in the photo may be described as eaten. Other items ' +
          'get at most a passing "they\'re also known for…"\n' +
          '- 1-2 short lines, 0-2 emoji\n' +
          '- End with 5-7 hashtags, at least one tied to the location\n' +
          `- ${BANNED_EN}`,
      };

    case 'facebook':
      return {
        system:
          'You are a local resident recommending a place you ate at. Write like ' +
          'a person posting to their own timeline, not like a business. Output ' +
          'only the post text — no explanations, no quotation marks, no preamble.',
        user:
          `Write a Facebook post using only these facts:\n${en}\n\n` +
          `Angle for this one: ${pick(ANGLES_EN)}\n\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Invent nothing beyond the facts above\n' +
          '- 2-3 sentences, conversational, mention the area naturally\n' +
          '- At most 2 hashtags\n' +
          `- ${BANNED_EN}`,
      };

    case 'tiktok':
      return {
        system:
          'You write short, punchy TikTok captions the way a real person types ' +
          'them. Output only the caption text — no explanations, no quotation ' +
          'marks, no preamble.',
        user:
          `Write a TikTok caption using only these facts:\n${en}\n\n` +
          `Angle for this one: ${pick(ANGLES_EN)}\n\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Invent nothing beyond the facts above\n' +
          '- One short hook line, lowercase is fine\n' +
          '- End with 4-6 hashtags\n' +
          `- ${BANNED_EN}`,
      };

    case 'google':
      return {
        system:
          'You write authentic, first-person Google reviews as a happy customer. ' +
          'Output only the ready-to-paste review text — no explanations, no quotation ' +
          'marks, no preamble, no star rating line.',
        user:
          `Write a positive Google review using only these facts:\n${en}\n\n` +
          `Angle for this one: ${pick(ANGLES_EN)}\n\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Genuine, specific, first-person ("I", "we")\n' +
          '- Invent nothing beyond the facts above\n' +
          '- 2-4 sentences mentioning the food and the experience\n' +
          '- No hashtags, at most one emoji\n' +
          `- ${BANNED_EN}`,
      };
  }
}
