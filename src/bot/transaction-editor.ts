import { InlineKeyboard, type Bot, type Context } from 'grammy';
import { getCategories } from '../db/categories.js';
import {
  listRecentTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransactionById,
  type TransactionListItem,
  type TransactionUpdate,
} from '../services/transactions.js';
import {
  updateTransactionInSheet,
  deleteTransactionFromSheet,
  type SheetRowEdits,
} from '../integrations/google-sheets.js';
import { monthKey } from '../integrations/month-key.js';
import {
  EDIT_CALLBACK_PREFIX,
  editCallback,
  parseEditCallback,
  parseAmountInput,
  normalizeDescriptionInput,
  formatEditButtonLabel,
  formatTransactionCard,
  autoInvestReminder,
  autoInvestDeleteReminder,
  MAX_DESCRIPTION_LENGTH,
} from './edit-logic.js';
import {
  setPendingEditInput,
  takePendingEditInput,
  clearPendingEditInput,
} from './pending-edit-input.js';

// /list editor: the last 20 transactions as buttons -> a card for one of them
// -> change its category (buttons), description or amount (typed reply).
// Each change updates the DB, then the matching Google Sheet row, then tells
// the other family member -- the same order and best-effort rules as edits
// made through the AI agent.

const LIST_SIZE = 20;
const NO_CATEGORY = 'Без категории';

interface EditorDeps {
  notifyOtherUsers: (ctx: Context, text: string) => Promise<void>;
}

async function showOrEdit(
  ctx: Context,
  text: string,
  keyboard: InlineKeyboard,
  edit: boolean,
): Promise<void> {
  if (edit) {
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
      return;
    } catch (error) {
      // "message is not modified" (same content) is harmless; anything else
      // (message too old to edit) falls back to sending a fresh message.
      if (error instanceof Error && error.message.includes('message is not modified')) {
        return;
      }
    }
  }
  await ctx.reply(text, { reply_markup: keyboard });
}

export async function showTransactionList(
  ctx: Context,
  edit = false,
  header?: string,
): Promise<void> {
  let transactions: TransactionListItem[];
  try {
    transactions = await listRecentTransactions(LIST_SIZE);
  } catch (error) {
    console.error('Failed to list transactions:', error);
    await ctx.reply('Не получилось получить список, попробуй ещё раз.');
    return;
  }

  if (transactions.length === 0) {
    await ctx.reply('Пока нет записей.');
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const t of transactions) {
    keyboard.text(formatEditButtonLabel(t), editCallback.open(t.id)).row();
  }
  keyboard.text('❌ Закрыть', editCallback.close());

  const title = 'Последние записи — нажми, чтобы изменить или удалить:';
  await showOrEdit(ctx, header ? `${header}\n\n${title}` : title, keyboard, edit);
}

function cardKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('🏷 Категория', editCallback.field(id, 'category'))
    .text('✏️ Описание', editCallback.field(id, 'description'))
    .text('💶 Сумма', editCallback.field(id, 'amount'))
    .row()
    .text('🗑 Удалить', editCallback.askDelete(id))
    .text('↩️ К списку', editCallback.list())
    .text('❌ Закрыть', editCallback.close());
}

async function showCard(
  ctx: Context,
  t: TransactionListItem,
  edit: boolean,
  header?: string,
): Promise<void> {
  const text = header ? `${header}\n\n${formatTransactionCard(t)}` : formatTransactionCard(t);
  await showOrEdit(ctx, text, cardKeyboard(t.id), edit);
}

async function loadTransaction(ctx: Context, id: number): Promise<TransactionListItem | null> {
  try {
    const t = await getTransactionById(id);
    if (!t) {
      await ctx.reply('Эта запись уже удалена. Открой /list заново.');
    }
    return t;
  } catch (error) {
    console.error('Failed to load transaction:', error);
    await ctx.reply('Не получилось открыть запись, попробуй ещё раз.');
    return null;
  }
}

// DB first (source of truth), then the Sheet row (located by the ORIGINAL
// values -- the template has no id column), then the other user. Returns the
// fresh transaction, or null if the DB update failed.
async function applyEdit(
  ctx: Context,
  deps: EditorDeps,
  original: TransactionListItem,
  patch: TransactionUpdate,
  sheetEdits: SheetRowEdits,
  changeText: string,
): Promise<TransactionListItem | null> {
  try {
    await updateTransaction(original.id, patch);
  } catch (error) {
    console.error('Failed to update transaction:', error);
    await ctx.reply('Не получилось сохранить изменение, попробуй ещё раз.');
    return null;
  }

  await updateTransactionInSheet(
    {
      month: monthKey(new Date(original.created_at)),
      type: original.type,
      amount: original.amount,
      description: original.description ?? '',
    },
    sheetEdits,
  );

  const updated = (await getTransactionById(original.id).catch(() => null)) ?? original;

  if (ctx.from) {
    const line = formatEditButtonLabel(updated);
    void deps.notifyOtherUsers(
      ctx,
      `👤 ${ctx.from.first_name}:\n✏️ Исправлено: ${line}\n${changeText}`,
    );
  }

  return updated;
}

export function registerTransactionEditor(bot: Bot, deps: EditorDeps): void {
  bot.command('list', async (ctx) => {
    if (ctx.from) {
      clearPendingEditInput(ctx.from.id);
    }
    await showTransactionList(ctx);
  });

  bot.callbackQuery(new RegExp(`^${EDIT_CALLBACK_PREFIX}`), async (ctx) => {
    const action = parseEditCallback(ctx.callbackQuery.data);
    if (!action) {
      await ctx.answerCallbackQuery({ text: 'Кнопка устарела, открой /list заново.' });
      return;
    }

    const userId = ctx.from.id;
    // Any navigation abandons a half-finished "type the new value" step
    // (asking for a new description/amount sets a fresh one below).
    clearPendingEditInput(userId);

    if (action.kind === 'close') {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      return;
    }

    if (action.kind === 'list') {
      await ctx.answerCallbackQuery();
      await showTransactionList(ctx, true);
      return;
    }

    await ctx.answerCallbackQuery();
    const t = await loadTransaction(ctx, action.id);
    if (!t) {
      return;
    }

    if (action.kind === 'open') {
      await showCard(ctx, t, true);
      return;
    }

    if (action.kind === 'askDelete') {
      const keyboard = new InlineKeyboard()
        .text('✅ Да, удалить', editCallback.confirmDelete(t.id))
        .text('↩️ Нет', editCallback.open(t.id));
      await showOrEdit(ctx, `Удалить эту запись?\n\n${formatTransactionCard(t)}`, keyboard, true);
      return;
    }

    if (action.kind === 'confirmDelete') {
      // DB first (source of truth), then the Sheet row by its values, then
      // the other user -- same order as an AI-agent delete.
      try {
        await deleteTransactionById(t.id);
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        await ctx.reply('Не получилось удалить, попробуй ещё раз.');
        return;
      }

      await deleteTransactionFromSheet({
        month: monthKey(new Date(t.created_at)),
        type: t.type,
        amount: t.amount,
        description: t.description ?? '',
      });

      const line = formatEditButtonLabel(t);
      void deps.notifyOtherUsers(ctx, `👤 ${ctx.from.first_name}:\n🗑 Удалено: ${line}`);

      await showTransactionList(ctx, true, `🗑 Удалено: ${line}`);
      const reminder = autoInvestDeleteReminder(t.type, t.amount);
      if (reminder) {
        await ctx.reply(reminder);
      }
      return;
    }

    if (action.kind === 'field') {
      if (action.field === 'category') {
        let categories;
        try {
          categories = (await getCategories()).filter((c) => c.type === t.type);
        } catch (error) {
          console.error('Failed to load categories:', error);
          await ctx.reply('Не получилось загрузить категории, попробуй ещё раз.');
          return;
        }
        const keyboard = new InlineKeyboard();
        for (const c of categories) {
          const mark = c.name === t.categoryName ? '✅ ' : '';
          keyboard.text(`${mark}${c.name}`, editCallback.setCategory(t.id, c.id)).row();
        }
        keyboard.text(NO_CATEGORY, editCallback.setCategory(t.id, null)).row();
        keyboard.text('↩️ Назад', editCallback.open(t.id));
        await showOrEdit(
          ctx,
          `Выбери новую категорию:\n\n${formatTransactionCard(t)}`,
          keyboard,
          true,
        );
        return;
      }

      setPendingEditInput(userId, { transactionId: t.id, field: action.field });
      const prompt =
        action.field === 'amount'
          ? 'Пришли новую сумму одним сообщением, например 12.50'
          : `Пришли новое описание одним сообщением (до ${MAX_DESCRIPTION_LENGTH} символов)`;
      const keyboard = new InlineKeyboard().text('❌ Отмена', editCallback.open(t.id));
      await showOrEdit(ctx, `${prompt}\n\n${formatTransactionCard(t)}`, keyboard, true);
      return;
    }

    // setCategory
    let categories;
    try {
      categories = await getCategories();
    } catch (error) {
      console.error('Failed to load categories:', error);
      await ctx.reply('Не получилось загрузить категории, попробуй ещё раз.');
      return;
    }

    const category =
      action.categoryId === null ? null : categories.find((c) => c.id === action.categoryId);
    if (category === undefined || (category && category.type !== t.type)) {
      await ctx.reply('Этой категории больше нет. Выбери другую.');
      return;
    }

    const newName = category?.name ?? NO_CATEGORY;
    const oldName = t.categoryName ?? NO_CATEGORY;
    if (newName === oldName) {
      await showCard(ctx, t, true);
      return;
    }

    const changeText = `🏷 Категория: ${oldName} → ${newName}`;
    const updated = await applyEdit(
      ctx,
      deps,
      t,
      { categoryId: category?.id ?? null },
      { categoryName: newName },
      changeText,
    );
    if (updated) {
      await showCard(ctx, updated, true, `✅ ${changeText}`);
    }
  });

  // Runs before the normal "text = new transaction" handler: if the user was
  // asked for a new description/amount, their next text message is that value.
  bot.on('message:text', async (ctx, next) => {
    const pending = takePendingEditInput(ctx.from.id);
    if (!pending || ctx.message.text.startsWith('/')) {
      return next();
    }

    const t = await loadTransaction(ctx, pending.transactionId);
    if (!t) {
      return;
    }

    if (pending.field === 'amount') {
      const amount = parseAmountInput(ctx.message.text);
      if (amount === null) {
        setPendingEditInput(ctx.from.id, pending);
        await ctx.reply('Не понял сумму. Пришли число больше нуля, например 12.50', {
          reply_markup: new InlineKeyboard().text('❌ Отмена', editCallback.open(t.id)),
        });
        return;
      }

      const changeText = `💶 Сумма: ${t.amount.toFixed(2)} € → ${amount.toFixed(2)} €`;
      const updated = await applyEdit(ctx, deps, t, { amount }, { amount }, changeText);
      if (updated) {
        await showCard(ctx, updated, false, `✅ ${changeText}`);
        const reminder = autoInvestReminder(t.type, t.amount, amount);
        if (reminder) {
          await ctx.reply(reminder);
        }
      }
      return;
    }

    const description = normalizeDescriptionInput(ctx.message.text);
    if (description === null) {
      setPendingEditInput(ctx.from.id, pending);
      await ctx.reply('Описание не может быть пустым. Пришли текст ещё раз.', {
        reply_markup: new InlineKeyboard().text('❌ Отмена', editCallback.open(t.id)),
      });
      return;
    }

    const changeText = `✏️ Описание: ${t.description || '—'} → ${description}`;
    const updated = await applyEdit(
      ctx,
      deps,
      t,
      { note: description },
      { description },
      changeText,
    );
    if (updated) {
      await showCard(ctx, updated, false, `✅ ${changeText}`);
    }
  });
}
