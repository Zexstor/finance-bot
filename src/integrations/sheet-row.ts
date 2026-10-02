import type { TransactionType, TransactionSource } from '../types/db.js';

// Pure row-formatting logic, kept separate from the actual Google API call
// so it can be unit-tested without credentials or network access.

export interface SheetRowInput {
  type: TransactionType;
  amount: number;
  categoryName: string | null;
  note: string | null;
  authorName: string;
  source: TransactionSource;
  createdAt: string;
}

const SOURCE_LABELS: Record<TransactionSource, string> = {
  text: 'текст',
  voice: 'голос',
  photo: 'фото чека',
};

export function formatSheetRow(row: SheetRowInput): Record<string, string | number> {
  return {
    Date: new Date(row.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Podgorica' }),
    Type: row.type === 'income' ? 'Доход' : 'Расход',
    Amount: row.amount,
    Category: row.categoryName ?? 'Без категории',
    Note: row.note || '',
    Author: row.authorName,
    Source: SOURCE_LABELS[row.source],
  };
}
