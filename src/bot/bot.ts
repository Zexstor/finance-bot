import { Bot, InlineKeyboard, type Context } from 'grammy';
import { env } from '../config/env.js';
import { accessControl } from './access-control.js';
import { ensureUser } from '../db/users.js';
import { getCategories, addCategory, deleteCategory } from '../db/categories.js';
import { classifyTransactions } from '../ai/classify-transaction.js';
import { classifyReceipt } from '../ai/classify-receipt.js';
import { transcribeVoice } from '../ai/transcribe-voice.js';
import { downloadTelegramFile } from './download-telegram-file.js';
import { setPending, takePending } from './pending-clarifications.js';
import { setPendingCategoryType, takePendingCategoryType } from './pending-category-input.js';
import { setPendingReceipt, takePendingReceipt } from './pending-receipts.js';
import { setPendingBatch, takePendingBatch } from './pending-batch.js';
import { uploadReceiptImage, deleteReceiptImage } from '../db/storage.js';
import { saveReceipt } from '../db/receipts.js';
import type { Category, TransactionType, TransactionSource } from '../types/db.js';
import {
  recordTransaction,
  listRecentTransactions,
  deleteLastTransaction,
  type TransactionListItem,
} from '../services/transactions.js';
import { getMonthlyReport, getMonthlyBalance, setMonthlyGoal, type MonthlyReport } from '../services/report.js';
import { isSumMismatched } from '../ai/receipt-logic.js';
import { truncateForTelegram, formatBalanceLine } from './format.js';
import { appendTransactionRow } from '../integrations/google-sheets.js';

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
  await replyText(ctx, ['Последние записи:', ...lines].join('\n'));
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

    const remaining = report.goal - report.income;
    if (remaining > 0) {
      lines.push(`До цели не хватает: ${remaining.toFixed(2)} €`);
    } else {
      lines.push(`Цель перевыполнена на: ${Math.abs(remaining).toFixed(2)} €`);
    }
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

  const balance = report.income - report.totalExpenses;
  const balanceLabel = balance >= 0 ? 'Остаток' : 'Перерасход';
  lines.push('', `${balanceLabel}: ${balance.toFixed(2)} €`);

  await replyText(ctx, lines.join('\n'));
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

bot.command('categories', async (ctx) => {
  let categories: Category[];

  try {
    categories = await getCategories();
  } catch (error) {
    console.error('Failed to load categories:', error);
    await ctx.reply('Не получилось получить категории, попробуй ещё раз.');
    return;
  }

  await ctx.reply('Категории. Нажми на категорию, чтобы удалить её, или добавь новую:', {
    reply_markup: buildCategoriesKeyboard(categories),
  });
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  const pendingCategoryType = takePendingCategoryType(ctx.from.id);

  if (pendingCategoryType) {
    const name = text.trim().slice(0, 40);

    if (!name) {
      await ctx.reply('Название не может быть пустым. Набери /categories и попробуй ещё раз.');
      return;
    }

    let result;
    try {
      result = await addCategory(name, pendingCategoryType);
    } catch (error) {
      console.error('Failed to add category:', error);
      await ctx.reply('Не получилось сохранить категорию, попробуй ещё раз.');
      return;
    }

    if (!result.ok) {
      await ctx.reply('Такая категория уже есть.');
      return;
    }

    const typeLabel = pendingCategoryType === 'income' ? 'доходная' : 'расходная';
    await ctx.reply(`✅ Добавлена ${typeLabel} категория «${result.category.name}».`);
    return;
  }

  await handleTransactionText(ctx, text, 'text');
});

bot.on('message:voice', async (ctx) => {
  let audioBuffer: Buffer;
  try {
    audioBuffer = await downloadTelegramFile(ctx, ctx.message.voice.file_id);
  } catch (error) {
    console.error('Failed to download voice message:', error);
    await ctx.reply('Не получилось скачать голосовое, попробуй ещё раз.');
    return;
  }

  let text: string;
  try {
    text = await transcribeVoice(audioBuffer);
  } catch (error) {
    console.error('Voice transcription failed:', error);
    await ctx.reply('Не получилось распознать голосовое, попробуй ещё раз.');
    return;
  }

  await ctx.reply(`🎤 Распознал: «${text}»`);
  await handleTransactionText(ctx, text, 'voice');
});

bot.on('message:photo', async (ctx) => {
  try {
    await ensureUser(ctx.from.id, ctx.from.first_name);
  } catch (error) {
    console.error('Failed to ensure user:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  const photos = ctx.message.photo;
  const largestPhoto = photos[photos.length - 1];

  let imageBuffer: Buffer;
  try {
    imageBuffer = await downloadTelegramFile(ctx, largestPhoto.file_id);
  } catch (error) {
    console.error('Failed to download receipt photo:', error);
    await ctx.reply('Не получилось скачать фото, попробуй ещё раз.');
    return;
  }

  let categories: Category[];
  try {
    categories = await getCategories();
  } catch (error) {
    console.error('Failed to load categories:', error);
    await ctx.reply('Не получилось обработать чек, попробуй ещё раз.');
    return;
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  let parsed;
  try {
    parsed = await classifyReceipt(imageBuffer, expenseCategories);
  } catch (error) {
    console.error('Receipt classification failed:', error);
    await ctx.reply('Не получилось распознать чек, попробуй ещё раз.');
    return;
  }

  if (parsed.items.length === 0) {
    await ctx.reply('Не похоже на чек — не нашёл ни одной позиции.');
    return;
  }

  const items = parsed.items.map((item) => {
    const matched = expenseCategories.find((c) => c.name === item.category);
    return {
      name: item.name,
      amount: item.amount,
      categoryId: matched?.id ?? null,
      categoryName: matched?.name ?? null,
    };
  });

  setPendingReceipt(ctx.from.id, {
    imageBuffer,
    storeName: parsed.store,
    totalAmount: parsed.total,
    items,
  });

  const itemsSum = items.reduce((sum, item) => sum + item.amount, 0);
  const lines = [`🧾 Чек: ${parsed.store ?? 'не определён'}`];
  if (parsed.total !== null) {
    lines.push(`Итого на чеке: ${parsed.total.toFixed(2)} €`);
  }
  lines.push('');
  for (const item of items) {
    lines.push(`➖ ${item.name} — ${item.amount.toFixed(2)} € — ${item.categoryName ?? 'Без категории'}`);
  }
  lines.push('', `Сумма позиций: ${itemsSum.toFixed(2)} €`);

  const sumMismatch = isSumMismatched(itemsSum, parsed.total);
  if (sumMismatch) {
    lines.push(
      '',
      '⚠️ Сумма позиций не совпадает с итогом чека — ИИ мог ошибиться при чтении фото. ' +
        'Проверь числа внимательно. Если что-то не так — жми «Отмена» и впиши операции текстом вручную.',
    );
  } else if (parsed.lowConfidence) {
    lines.push(
      '',
      '⚠️ ИИ дважды прочитал чек по-разному (хотя суммы совпали) — есть риск, что позиции ' +
        'перепутаны местами. Сверь каждую позицию с чеком перед тем как сохранять.',
    );
  }

  const keyboard = new InlineKeyboard().text('✅ Сохранить', 'receipt:confirm').row().text('❌ Отмена', 'receipt:cancel');

  await replyText(ctx, lines.join('\n'), { reply_markup: keyboard });
});

async function handleTransactionText(ctx: Context, text: string, source: TransactionSource): Promise<void> {
  if (!ctx.from) {
    return;
  }

  try {
    await ensureUser(ctx.from.id, ctx.from.first_name);
  } catch (error) {
    console.error('Failed to ensure user:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  let categories;
  try {
    categories = await getCategories();
  } catch (error) {
    console.error('Failed to load categories:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  let transactions;
  try {
    transactions = await classifyTransactions(text, categories);
  } catch (error) {
    console.error('AI classification failed:', error);
    await ctx.reply('Не получилось обработать сообщение, попробуй ещё раз.');
    return;
  }

  if (transactions.length === 0) {
    await ctx.reply('Не понял, это про деньги? Опиши операцию и сумму, например: кофе 3.5');
    return;
  }

  if (transactions.some((t) => t.currency !== 'EUR')) {
    await ctx.reply('Пиши суммы в евро, попробуй ещё раз.');
    return;
  }

  if (transactions.length === 1) {
    const result = transactions[0];
    const sameTypeCategories = categories.filter((c) => c.type === result.type);
    const matchedCategory = result.category
      ? sameTypeCategories.find((c) => c.name === result.category)
      : undefined;

    if (!matchedCategory) {
      setPending(ctx.from.id, {
        type: result.type,
        amount: result.amount,
        note: result.note,
        source,
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
      await recordTransaction(ctx.from.id, result.type, result.amount, result.note, matchedCategory.id, source);
    } catch (error) {
      console.error('Failed to record transaction:', error);
      await ctx.reply('Не получилось сохранить, попробуй ещё раз.');
      return;
    }

    void appendTransactionRow({
      type: result.type,
      amount: result.amount,
      categoryName: matchedCategory.name,
      note: result.note,
      createdAt: new Date().toISOString(),
    });

    const icon = result.type === 'income' ? '➕' : '➖';
    const label = result.type === 'income' ? 'Доход' : 'Расход';
    const balanceSuffix = await getBalanceSuffix();
    await ctx.reply(
      `${icon} ${label}: ${result.amount.toFixed(2)} € — ${matchedCategory.name} (${result.note || 'без заметки'})${balanceSuffix}`,
    );
    return;
  }

  const resolvedItems = transactions.map((t) => {
    const sameTypeCategories = categories.filter((c) => c.type === t.type);
    const matched = t.category ? sameTypeCategories.find((c) => c.name === t.category) : undefined;
    return {
      type: t.type,
      amount: t.amount,
      note: t.note,
      categoryId: matched?.id ?? null,
      categoryName: matched?.name ?? null,
    };
  });

  setPendingBatch(ctx.from.id, { items: resolvedItems, source });

  const lines = ['Нашёл несколько операций:'];
  for (const item of resolvedItems) {
    const icon = item.type === 'income' ? '➕' : '➖';
    const label = item.categoryName ?? 'Без категории';
    lines.push(`${icon} ${item.amount.toFixed(2)} € — ${label} (${item.note || 'без заметки'})`);
  }
  lines.push('', 'Сохранить всё?');

  const keyboard = new InlineKeyboard().text('✅ Сохранить всё', 'batch:confirm').row().text('❌ Отмена', 'batch:cancel');
  await replyText(ctx, lines.join('\n'), { reply_markup: keyboard });
}

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'noop') {
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith('delcat:')) {
    const id = Number(data.replace('delcat:', ''));

    let result;
    try {
      result = await deleteCategory(id);
    } catch (error) {
      console.error('Failed to delete category:', error);
      await ctx.answerCallbackQuery({ text: 'Не получилось удалить.' });
      return;
    }

    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: 'Нельзя удалить — используется в операциях.', show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Удалено' });

    try {
      const categories = await getCategories();
      await ctx.editMessageReplyMarkup({ reply_markup: buildCategoriesKeyboard(categories) });
    } catch (error) {
      console.error('Failed to refresh categories keyboard:', error);
    }
    return;
  }

  if (data.startsWith('addcat:')) {
    const type = data.replace('addcat:', '') as TransactionType;
    setPendingCategoryType(ctx.from.id, type);
    await ctx.answerCallbackQuery();
    const typeLabel = type === 'income' ? 'доходной' : 'расходной';
    await ctx.reply(`Напиши название новой ${typeLabel} категории:`);
    return;
  }

  if (data === 'receipt:cancel') {
    takePendingReceipt(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Отменено.');
    return;
  }

  if (data === 'receipt:confirm') {
    const pendingReceipt = takePendingReceipt(ctx.from.id);

    if (!pendingReceipt) {
      await ctx.answerCallbackQuery({ text: 'Это предложение устарело.' });
      return;
    }

    const imagePath = `${ctx.from.id}/${Date.now()}.jpg`;

    try {
      await uploadReceiptImage(imagePath, pendingReceipt.imageBuffer);
    } catch (error) {
      console.error('Failed to upload receipt image:', error);
      await ctx.answerCallbackQuery({ text: 'Не получилось сохранить чек.' });
      return;
    }

    try {
      await saveReceipt(
        ctx.from.id,
        pendingReceipt.storeName,
        pendingReceipt.totalAmount,
        imagePath,
        pendingReceipt.items.map((item) => ({
          name: item.name,
          amount: item.amount,
          categoryId: item.categoryId,
        })),
      );
    } catch (error) {
      console.error('Failed to save receipt:', error);
      await deleteReceiptImage(imagePath).catch((cleanupError) => {
        console.error('Failed to clean up orphaned receipt image:', cleanupError);
      });
      await ctx.answerCallbackQuery({ text: 'Не получилось сохранить чек.' });
      return;
    }

    const receiptCreatedAt = new Date().toISOString();
    for (const item of pendingReceipt.items) {
      // Awaited sequentially, not fired concurrently: each call reads the
      // sheet to find the first empty row, then writes it. Firing these in
      // parallel let multiple items race to the same "empty" row, so only
      // the last write to land actually stuck -- the rest silently vanished.
      await appendTransactionRow({
        type: 'expense',
        amount: item.amount,
        categoryName: item.categoryName,
        note: item.name,
        createdAt: receiptCreatedAt,
      });
    }

    const receiptBalanceSuffix = await getBalanceSuffix();
    await ctx.answerCallbackQuery({ text: 'Сохранено' });
    await ctx.editMessageText(`✅ Чек сохранён.${receiptBalanceSuffix}`);
    return;
  }

  if (data === 'batch:cancel') {
    takePendingBatch(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Отменено.');
    return;
  }

  if (data === 'batch:confirm') {
    const batch = takePendingBatch(ctx.from.id);

    if (!batch) {
      await ctx.answerCallbackQuery({ text: 'Это предложение устарело.' });
      return;
    }

    try {
      for (const item of batch.items) {
        await recordTransaction(ctx.from.id, item.type, item.amount, item.note, item.categoryId, batch.source);
      }
    } catch (error) {
      console.error('Failed to save batch:', error);
      await ctx.answerCallbackQuery({ text: 'Не получилось сохранить.' });
      return;
    }

    const batchCreatedAt = new Date().toISOString();
    for (const item of batch.items) {
      // See the matching comment in the receipt branch above: must be
      // awaited sequentially, not fired concurrently.
      await appendTransactionRow({
        type: item.type,
        amount: item.amount,
        categoryName: item.categoryName,
        note: item.note,
        createdAt: batchCreatedAt,
      });
    }

    const batchBalanceSuffix = await getBalanceSuffix();
    await ctx.answerCallbackQuery({ text: 'Сохранено' });
    await ctx.editMessageText(`✅ Сохранено операций: ${batch.items.length}.${batchBalanceSuffix}`);
    return;
  }

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
    await recordTransaction(
      ctx.from.id,
      pendingEntry.type,
      pendingEntry.amount,
      pendingEntry.note,
      categoryId,
      pendingEntry.source,
    );
  } catch (error) {
    console.error('Failed to record transaction after clarification:', error);
    await ctx.answerCallbackQuery({ text: 'Не получилось сохранить.' });
    return;
  }

  void appendTransactionRow({
    type: pendingEntry.type,
    amount: pendingEntry.amount,
    categoryName,
    note: pendingEntry.note,
    createdAt: new Date().toISOString(),
  });

  const clarifyBalanceSuffix = await getBalanceSuffix();
  await ctx.answerCallbackQuery();
  const icon = pendingEntry.type === 'income' ? '➕' : '➖';
  const label = pendingEntry.type === 'income' ? 'Доход' : 'Расход';
  await ctx.editMessageText(
    `${icon} ${label}: ${pendingEntry.amount.toFixed(2)} € — ${categoryName} (${pendingEntry.note || 'без заметки'})${clarifyBalanceSuffix}`,
  );
});

function buildCategoriesKeyboard(categories: Category[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const expense = categories.filter((c) => c.type === 'expense');
  const income = categories.filter((c) => c.type === 'income');

  keyboard.text('— Расходы —', 'noop').row();
  for (const category of expense) {
    keyboard.text(`🗑 ${category.name}`, `delcat:${category.id}`).row();
  }
  keyboard.text('➕ Добавить расходную', 'addcat:expense').row();

  keyboard.text('— Доходы —', 'noop').row();
  for (const category of income) {
    keyboard.text(`🗑 ${category.name}`, `delcat:${category.id}`).row();
  }
  keyboard.text('➕ Добавить доходную', 'addcat:income');

  return keyboard;
}

async function replyText(
  ctx: Context,
  text: string,
  extra?: Parameters<Context['reply']>[1],
): Promise<void> {
  const safeText = truncateForTelegram(text);

  try {
    await ctx.reply(safeText, extra);
  } catch (error) {
    console.error('Failed to send reply:', error);
  }
}

async function getBalanceSuffix(): Promise<string> {
  try {
    const balance = await getMonthlyBalance();
    return `\n\n${formatBalanceLine(balance)}`;
  } catch (error) {
    console.error('Failed to fetch monthly balance:', error);
    return '';
  }
}

function formatTransactionLine(t: TransactionListItem): string {
  const date = new Date(t.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const icon = t.type === 'income' ? '➕' : '➖';
  const amount = t.amount.toFixed(2);
  const label = t.categoryName ?? (t.description || '—');
  return `${date} ${icon} ${amount} € — ${label} (${t.authorName})`;
}
