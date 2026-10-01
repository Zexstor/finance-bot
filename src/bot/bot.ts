import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { accessControl } from './access-control.js';
import { ensureUser } from '../db/users.js';
import { parseTransactionText } from '../services/parse-transaction.js';
import { recordTransaction, listRecentTransactions, type TransactionListItem } from '../services/transactions.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.catch((error) => {
  console.error('Unhandled bot error:', error);
});

bot.use(accessControl);

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Бот учёта финансов запущен.');
});

bot.command('list', async (ctx) => {
  let transactions: TransactionListItem[];

  try {
    transactions = await listRecentTransactions(20);
  } catch (error) {
    console.error('Failed to list transactions:', error);
    await ctx.reply('Не получилось получить список, попробуй ещё раз.');
    return;
  }

  if (transactions.length === 0) {
    await ctx.reply('Пока нет записей.');
    return;
  }

  const lines = transactions.map(formatTransactionLine);
  await ctx.reply(['Последние записи:', ...lines].join('\n'));
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  const result = parseTransactionText(text);

  if (!result.ok) {
    const message =
      result.reason === 'multiple_amounts'
        ? 'Нашёл больше одной суммы — пока умею сохранять только одну операцию за сообщение. Напиши по одной.'
        : 'Не нашёл сумму в сообщении. Напиши, например: кофе 3.5 (расход) или +1500 зарплата (доход)';
    await ctx.reply(message);
    return;
  }

  try {
    await ensureUser(ctx.from.id, ctx.from.first_name);
    await recordTransaction(ctx.from.id, result.type, result.amount, result.note);
  } catch (error) {
    console.error('Failed to record transaction:', error);
    await ctx.reply('Не получилось сохранить, попробуй ещё раз.');
    return;
  }

  const noteText = result.note || 'без заметки';
  const label = result.type === 'income' ? 'доход' : 'расход';
  const icon = result.type === 'income' ? '➕' : '➖';
  await ctx.reply(`${icon} Записал ${label}: ${result.amount.toFixed(2)} € — ${noteText}`);
});

function formatTransactionLine(t: TransactionListItem): string {
  const date = new Date(t.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const icon = t.type === 'income' ? '➕' : '➖';
  const amount = t.amount.toFixed(2);
  const label = t.categoryName ?? (t.description || '—');
  return `${date} ${icon} ${amount} € — ${label} (${t.authorName})`;
}
