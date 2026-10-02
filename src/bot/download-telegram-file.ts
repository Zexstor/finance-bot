import type { Context } from 'grammy';
import { env } from '../config/env.js';

export async function downloadTelegramFile(ctx: Context, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download Telegram file: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
