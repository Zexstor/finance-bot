import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { accessControl } from './access-control.js';
import { ensureUser } from '../db/users.js';
import { parseExpenseText } from '../services/parse-expense.js';
import { recordExpense } from '../services/expenses.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.catch((error) => {
  console.error('Unhandled bot error:', error);
});

bot.use(accessControl);

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Бот учёта финансов запущен.');
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  const result = parseExpenseText(text);

  if (!result.ok) {
    const message =
      result.reason === 'multiple_amounts'
        ? 'Нашёл больше одной суммы — пока умею сохранять только одну трату за сообщение. Напиши по одной.'
        : 'Не нашёл сумму в сообщении. Напиши, например: кофе 3.5';
    await ctx.reply(message);
    return;
  }

  try {
    await ensureUser(ctx.from.id, ctx.from.first_name);
    await recordExpense(ctx.from.id, result.amount, result.note);
  } catch (error) {
    console.error('Failed to record expense:', error);
    await ctx.reply('Не получилось сохранить расход, попробуй ещё раз.');
    return;
  }

  const noteText = result.note || 'без заметки';
  await ctx.reply(`✅ Записал: ${result.amount.toFixed(2)} € — ${noteText}`);
});
