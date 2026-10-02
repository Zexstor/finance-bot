import type { Context, NextFunction } from 'grammy';
import { env } from '../config/env.js';

const allowedUserIds = new Set(env.ALLOWED_USER_IDS);

export async function accessControl(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;

  // Silently ignore unauthorized senders and non-private chats instead of
  // replying — the bot's own username is public, so replying to everyone
  // who messages it is a free spam/cost vector with no benefit.
  if (userId === undefined || !allowedUserIds.has(userId) || ctx.chat?.type !== 'private') {
    return;
  }

  await next();
}
