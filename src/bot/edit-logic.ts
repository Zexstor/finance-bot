import type { TransactionType } from '../types/db.js';
import { APP_TIME_ZONE } from '../integrations/month-key.js';
import { calculateAutoInvestment } from '../services/auto-investment-logic.js';

// Pure logic for the /list transaction editor (button labels, the card text,
// callback-data encoding, parsing what the user types as a new amount or
// description). Kept free of Telegram/DB calls so it's unit-tested directly.

export type EditField = 'category' | 'description' | 'amount';

export type EditCallback =
  | { kind: 'list' }
  | { kind: 'open'; id: number }
  | { kind: 'field'; id: number; field: EditField }
  | { kind: 'setCategory'; id: number; categoryId: number | null }
  | { kind: 'close' };

// Short codes keep callback data well under Telegram's 64-byte limit.
const FIELD_TO_CODE: Record<EditField, string> = { category: 'c', description: 'd', amount: 'a' };
const CODE_TO_FIELD: Record<string, EditField> = { c: 'category', d: 'description', a: 'amount' };

export const EDIT_CALLBACK_PREFIX = 'ed:';

export const editCallback = {
  list: (): string => 'ed:l',
  open: (id: number): string => `ed:o:${id}`,
  field: (id: number, field: EditField): string => `ed:f:${id}:${FIELD_TO_CODE[field]}`,
  setCategory: (id: number, categoryId: number | null): string => `ed:c:${id}:${categoryId ?? 'n'}`,
  close: (): string => 'ed:x',
};

const POSITIVE_INT = /^[1-9]\d*$/;

function parseId(raw: string | undefined): number | null {
  return raw !== undefined && POSITIVE_INT.test(raw) ? Number(raw) : null;
}

export function parseEditCallback(data: string): EditCallback | null {
  const parts = data.split(':');
  if (parts[0] !== 'ed') {
    return null;
  }

  switch (parts[1]) {
    case 'l':
      return parts.length === 2 ? { kind: 'list' } : null;
    case 'x':
      return parts.length === 2 ? { kind: 'close' } : null;
    case 'o': {
      const id = parseId(parts[2]);
      return id !== null && parts.length === 3 ? { kind: 'open', id } : null;
    }
    case 'f': {
      const id = parseId(parts[2]);
      const field = CODE_TO_FIELD[parts[3] ?? ''];
      return id !== null && field && parts.length === 4 ? { kind: 'field', id, field } : null;
    }
    case 'c': {
      const id = parseId(parts[2]);
      if (id === null || parts.length !== 4) {
        return null;
      }
      if (parts[3] === 'n') {
        return { kind: 'setCategory', id, categoryId: null };
      }
      const categoryId = parseId(parts[3]);
      return categoryId !== null ? { kind: 'setCategory', id, categoryId } : null;
    }
    default:
      return null;
  }
}

export const MAX_AMOUNT = 1_000_000;

// Accepts what people actually type: "12.5", "12,5", "12", "12 €", "12eur".
// Returns null for anything that isn't a positive amount (so the bot asks
// again instead of saving garbage).
export function parseAmountInput(text: string): number | null {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/(€|eur|евро)$/u, '')
    .replace(/\s+/g, '')
    .replace(',', '.');

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const value = Math.round(Number(cleaned) * 100) / 100;
  return value > 0 && value <= MAX_AMOUNT ? value : null;
}

export const MAX_DESCRIPTION_LENGTH = 100;

export function normalizeDescriptionInput(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_LENGTH);
  return normalized === '' ? null : normalized;
}

export interface EditableTransaction {
  id: number;
  type: TransactionType;
  amount: number;
  description: string | null;
  created_at: string;
  authorName: string;
  categoryName: string | null;
}

function formatDate(iso: string, timeZone: string, withYear: boolean): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone,
  });
}

const MAX_BUTTON_LABEL = 60;

export function formatEditButtonLabel(
  t: EditableTransaction,
  timeZone: string = APP_TIME_ZONE,
): string {
  const icon = t.type === 'income' ? '➕' : '➖';
  const parts = [`${formatDate(t.created_at, timeZone, false)} ${icon} ${t.amount.toFixed(2)} €`];
  parts.push(t.categoryName ?? 'Без категории');
  if (t.description) {
    parts.push(t.description);
  }
  const label = parts.join(' · ');
  return label.length > MAX_BUTTON_LABEL ? `${label.slice(0, MAX_BUTTON_LABEL - 1)}…` : label;
}

export function formatTransactionCard(
  t: EditableTransaction,
  timeZone: string = APP_TIME_ZONE,
): string {
  const kind = t.type === 'income' ? '➕ Доход' : '➖ Расход';
  return [
    `${kind} от ${formatDate(t.created_at, timeZone, true)} (${t.authorName})`,
    `💶 Сумма: ${t.amount.toFixed(2)} €`,
    `🏷 Категория: ${t.categoryName ?? 'Без категории'}`,
    `✏️ Описание: ${t.description || '—'}`,
  ].join('\n');
}

// Option A from the plan: changing an income's amount does NOT touch its
// auto-investment entry (there's no stored link between the two, only a
// matching timestamp, and guessing could edit the wrong row). Instead the
// user is told what the 10% now comes to, so they can fix it themselves.
export function autoInvestReminder(
  type: TransactionType,
  oldAmount: number,
  newAmount: number,
): string | null {
  if (type !== 'income' || Math.abs(oldAmount - newAmount) < 0.005) {
    return null;
  }
  const before = calculateAutoInvestment(oldAmount).toFixed(2);
  const after = calculateAutoInvestment(newAmount).toFixed(2);
  return (
    `ℹ️ Авто-инвестиция с этого дохода сама не пересчитывается: было ${before} €, ` +
    `теперь 10% = ${after} €. Если нужно — поправь запись «Авто-инвестиции» в /list.`
  );
}
