import type { TransactionType } from '../types/db.js';
import { APP_TIME_ZONE, monthKey } from './month-key.js';

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

export interface RemovedRowInput {
  type: TransactionType;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface SheetRowLocator {
  month: string;
  type: TransactionType;
  amount: number;
  description: string;
}

// Where an undone transaction's row lives: the month comes from its
// created_at in the app time zone -- the same rule used when the row was
// written -- so an entry logged just after local midnight is looked up in
// the right month's spreadsheet.
export function locateRemovedRow(removed: RemovedRowInput): SheetRowLocator {
  return {
    month: monthKey(new Date(removed.createdAt)),
    type: removed.type,
    amount: removed.amount,
    description: removed.description ?? '',
  };
}

// Where new rows go in a column block: right after the LAST used row, not
// into the first gap. Deletes (/undo, the /list editor, the AI agent) leave
// blank rows mid-block; filling the first gap put a new entry in the middle
// of older dates where nobody looks for it, and a multi-row batch (receipt,
// several operations in one message) written from a one-row gap would
// overwrite the filled rows right below it. Returns null if `count` rows
// don't fit before `maxRow`.
export function findAppendRow(
  isRowUsed: (row: number) => boolean,
  firstRow: number,
  maxRow: number,
  count = 1,
): number | null {
  let start = firstRow;
  for (let r = maxRow - 1; r >= firstRow; r--) {
    if (isRowUsed(r)) {
      start = r + 1;
      break;
    }
  }
  return start + count <= maxRow ? start : null;
}
