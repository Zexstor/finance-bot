import type { TransactionType } from '../types/db.js';
import { APP_TIME_ZONE } from './month-key.js';

// Pure logic for writing into the user's existing Google Sheets budget
// template (the "Транзакции" tab: two side-by-side blocks sharing one
// layout — expenses on the left, income on the right). Kept separate from
// the actual Google API calls so it's unit-tested without credentials or
// network access.

export interface TemplateColumns {
  date: number;
  amount: number;
  description: number;
  category: number;
}

// 0-indexed column numbers within the "Транзакции" sheet.
export const EXPENSE_COLUMNS: TemplateColumns = { date: 1, amount: 2, description: 3, category: 4 };
export const INCOME_COLUMNS: TemplateColumns = { date: 6, amount: 7, description: 8, category: 9 };

export function columnsFor(type: TransactionType): TemplateColumns {
  return type === 'income' ? INCOME_COLUMNS : EXPENSE_COLUMNS;
}

const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);

// Serial for the date's LOCAL calendar day (app time zone), so the date shown
// in the sheet matches the month the transaction is filed under (monthKey is
// also local). Computing it from the raw UTC instant instead used to put a
// transaction logged at 00:47 local (23:47 UTC the day before) under the
// previous day's date while monthKey filed it in the current month.
export function toSheetsSerial(date: Date, timeZone: string = APP_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localMidnightUtc = Date.UTC(get('year'), get('month') - 1, get('day'));
  return Math.round((localMidnightUtc - SHEETS_EPOCH_MS) / 86_400_000);
}

export interface TemplateRowInput {
  type: TransactionType;
  amount: number;
  categoryName: string | null;
  note: string | null;
}

export interface TemplateRowValues {
  amount: number;
  description: string;
  category: string;
}

export function buildTemplateRowValues(row: TemplateRowInput): TemplateRowValues {
  return {
    amount: row.amount,
    description: row.note || '',
    category: row.categoryName ?? 'Без категории',
  };
}
