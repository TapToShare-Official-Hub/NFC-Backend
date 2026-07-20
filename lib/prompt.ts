import type { PlatformId } from '@/lib/platforms';

interface Prompt {
  system: string;
  user: string;
}

/**
 * Build the system + user prompt for a caption.
 * Xiaohongshu captions are written in Simplified Chinese; everything else in English.
 */
export function buildPrompt(
  platform: PlatformId,
  name: string,
  cuisine: string,
): Prompt {
  switch (platform) {
    case 'xiaohongshu':
      return {
        system:
          '你是一位小红书美食博主。你只输出可以直接复制粘贴的中文帖子文案，' +
          '不要加任何解释、引号或前后缀。风格要真实、有感染力、带点“种草”语气，' +
          '适合手机上一屏读完。',
        user:
          `为餐厅「${name}」写一条小红书帖子文案，主打${cuisine}。\n` +
          '要求：\n' +
          '- 全部使用简体中文\n' +
          '- 一个抓眼球的开头标题\n' +
          '- 2-4 句真实的正文，自然融入 emoji\n' +
          '- 结尾放 4-6 个相关话题标签（#号）\n' +
          '- 总长度控制在小红书正文范围内，不要太长',
      };

    case 'instagram':
      return {
        system:
          'You are a food influencer writing Instagram captions. Output only the ' +
          'ready-to-paste caption text — no explanations, no quotation marks, no preamble.',
        user:
          `Write an Instagram caption for "${name}", a ${cuisine} restaurant.\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Aesthetic, warm, and appetizing tone\n' +
          '- 1-2 short lines with a few tasteful emoji\n' +
          '- End with 5-7 relevant hashtags',
      };

    case 'facebook':
      return {
        system:
          'You write friendly Facebook posts for local businesses. Output only the ' +
          'ready-to-paste post text — no explanations, no quotation marks, no preamble.',
        user:
          `Write a Facebook post for "${name}", a ${cuisine} restaurant.\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Warm, community-friendly, conversational tone\n' +
          '- 2-3 sentences that make people want to visit and share\n' +
          '- At most 2 hashtags (Facebook readers dislike hashtag spam)',
      };

    case 'tiktok':
      return {
        system:
          'You write punchy TikTok captions for food videos. Output only the ' +
          'ready-to-paste caption text — no explanations, no quotation marks, no preamble.',
        user:
          `Write a TikTok caption for a video at "${name}", a ${cuisine} restaurant.\n` +
          'Requirements:\n' +
          '- English\n' +
          '- Short, punchy, hook-driven — grabs attention in the first few words\n' +
          '- A little playful, trend-aware energy\n' +
          '- End with 4-6 relevant hashtags',
      };

    case 'google':
      return {
        system:
          'You write authentic, first-person Google reviews as a happy customer. ' +
          'Output only the ready-to-paste review text — no explanations, no quotation ' +
          'marks, no preamble, no star rating line.',
        user:
          `Write a positive Google review for "${name}", a ${cuisine} restaurant, ` +
          'from the perspective of a satisfied diner.\n' +
          'Requirements:\n' +
          '- English\n' +
          '- Genuine, specific, first-person ("I", "we")\n' +
          '- 2-4 sentences mentioning the food and the experience\n' +
          '- No hashtags, no emoji spam (one at most)',
      };
  }
}
