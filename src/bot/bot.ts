import { Bot, InlineKeyboard } from 'grammy';
import { env } from '../config/env.js';
import { accessControl } from './access-control.js';
import { ensureUser } from '../db/users.js';
import { getCategories } from '../db/categories.js';
import { classifyTransaction } from '../ai/classify-transaction.js';
import { setPending, takePending } from './pending-clarifications.js';
import {
  recordTransaction,
  listRecentTransactions,
  deleteLastTransaction,
  type TransactionListItem,
} from '../services/transactions.js';
import { getMonthlyReport, setMonthlyGoal, type MonthlyReport } from '../services/report.js';

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

bot.command('report', async (ctx) => {
  let report: MonthlyReport;

  try {
    report = await getMonthlyReport();
  } catch (error) {
    console.error('Failed to build report:', error);
    await ctx.reply('Не получилось построить отчёт, попробуй ещё раз.');
    return;
  }

  const lines = [`📊 Отчёт за ${report.monthLabel}`, ''];

  if (report.goal > 0) {
    const percent = Math.round((report.income / report.goal) * 100);
    lines.push(`Доход: ${report.income.toFixed(2)} € из цели ${report.goal.toFixed(2)} € (${percent}%)`);
  } else {
    lines.push(`Доход: ${report.income.toFixed(2)} € (цель не задана — /setgoal сумма)`);
  }

  lines.push('', 'Расходы по категориям:');

  if (report.expensesByCategory.length === 0) {
    lines.push('пока нет расходов за этот месяц');
  } else {
    for (const category of report.expensesByCategory) {
      lines.push(`➖ ${category.name}: ${category.total.toFixed(2)} €`);
    }
    lines.push(`Итого расходов: ${report.totalExpenses.toFixed(2)} €`);
  }

  await ctx.reply(lines.join('\n'));
});

bot.command('setgoal', async (ctx) => {
  const amount = Number(ctx.match.trim().replace(',', '.'));

  if (!ctx.match.trim() || !Number.isFinite(amount) || amount <= 0) {
    await ctx.reply('Укажи сумму цели, например: /setgoal 2000');
    return;
  }

  try {
    await setMonthlyGoal(amount);
  } catch (error) {
    console.error('Failed to set monthly goal:', error);
    await ctx.reply('Не получилось сохранить цель, попробуй ещё раз.');
    return;
  }

  await ctx.reply(`✅ Цель на месяц: ${amount.toFixed(2)} €`);
});

bot.command('undo', async (ctx) => {
  let removed;

  try {
    removed = await deleteLastTransaction();
  } catch (error) {
    console.error('Failed to undo last transaction:', error);
    await ctx.reply('Не получилось отменить, попробуй ещё раз.');
    return;
  }

  if (!removed) {
    await ctx.reply('Пока нечего отменять.');
    return;
  }

  const icon = removed.type === 'income' ? '➕' : '➖';
  const label = removed.type === 'income' ? 'доход' : 'расход';
  await ctx.reply(
    `↩️ Удалил последний ${label}: ${icon} ${removed.amount.toFixed(2)} € — ${removed.description || 'без заметки'} (${removed.authorName})`,
  );
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  await ensureUser(ctx.from.id, ctx.from.first_name);

  let categories;
  try {
    categories = await getCategories();
  } catch (error) {
    console.error('Failed to load categories:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  let result;
  try {
    result = await classifyTransaction(text, categories);
  } catch (error) {
    console.error('AI classification failed:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  if (!result.type || result.amount === null) {
    await ctx.reply('Не понял, это про деньги? Опиши операцию и сумму, например: кофе 3.5');
    return;
  }

  if (result.currency && result.currency !== 'EUR') {
    await ctx.reply('Пиши сумму в евро, попробуй ещё раз.');
    return;
  }

  const sameTypeCategories = categories.filter((c) => c.type === result.type);
  const matchedCategory = result.category
    ? sameTypeCategories.find((c) => c.name === result.category)
    : undefined;

  if (!matchedCategory) {
    setPending(ctx.from.id, {
      type: result.type,
      amount: result.amount,
      note: result.note,
      categories: sameTypeCategories.map((c) => ({ id: c.id, name: c.name })),
    });

    const keyboard = new InlineKeyboard();
    for (const category of sameTypeCategories) {
      keyboard.text(category.name, `cat:${category.id}`).row();
    }
    keyboard.text('Без категории', 'cat:none').row();
    keyboard.text('Отмена', 'cat:cancel');

    const label = result.type === 'income' ? 'Доход' : 'Расход';
    await ctx.reply(
      `Не уверен с категорией. ${label}: ${result.amount.toFixed(2)} € — ${result.note || 'без заметки'}. Выбери категорию:`,
      { reply_markup: keyboard },
    );
    return;
  }

  try {
    await recordTransaction(ctx.from.id, result.type, result.amount, result.note, matchedCategory.id);
  } catch (error) {
    console.error('Failed to record transaction:', error);
    await ctx.reply('Не получилось сохранить, попробуй ещё раз.');
    return;
  }

  const icon = result.type === 'income' ? '➕' : '➖';
  const label = result.type === 'income' ? 'Доход' : 'Расход';
  await ctx.reply(`${icon} ${label}: ${result.amount.toFixed(2)} € — ${matchedCategory.name} (${result.note || 'без заметки'})`);
});

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const pendingEntry = takePending(ctx.from.id);

  if (!pendingEntry) {
    await ctx.answerCallbackQuery({ text: 'Это предложение устарело.' });
    return;
  }

  if (data === 'cat:cancel') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Отменено.');
    return;
  }

  let categoryId: number | null = null;
  let categoryName = 'Без категории';

  if (data !== 'cat:none') {
    const id = Number(data.replace('cat:', ''));
    const found = pendingEntry.categories.find((c) => c.id === id);
    if (found) {
      categoryId = found.id;
      categoryName = found.name;
    }
  }

  try {
    await recordTransaction(ctx.from.id, pendingEntry.type, pendingEntry.amount, pendingEntry.note, categoryId);
  } catch (error) {
    console.error('Failed to record transaction after clarification:', error);
    await ctx.answerCallbackQuery({ text: 'Не получилось сохранить.' });
    return;
  }

  await ctx.answerCallbackQuery();
  const icon = pendingEntry.type === 'income' ? '➕' : '➖';
  const label = pendingEntry.type === 'income' ? 'Доход' : 'Расход';
  await ctx.editMessageText(
    `${icon} ${label}: ${pendingEntry.amount.toFixed(2)} € — ${categoryName} (${pendingEntry.note || 'без заметки'})`,
  );
});

function formatTransactionLine(t: TransactionListItem): string {
  const date = new Date(t.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const icon = t.type === 'income' ? '➕' : '➖';
  const amount = t.amount.toFixed(2);
  const label = t.categoryName ?? (t.description || '—');
  return `${date} ${icon} ${amount} € — ${label} (${t.authorName})`;
}
