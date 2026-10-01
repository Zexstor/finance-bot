import type { Context, NextFunction } from 'grammy';
import { env } from '../config/env.js';

const allowedUserIds = new Set(env.ALLOWED_USER_IDS);

export async function accessControl(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;

  if (userId === undefined || !allowedUserIds.has(userId)) {
    await ctx.reply('Доступ к этому боту ограничен.');
    return;
  }

  await next();
}
