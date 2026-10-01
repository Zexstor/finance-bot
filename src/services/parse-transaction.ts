import type { TransactionType } from '../types/db.js';

type ParseResult =
  | { ok: true; type: TransactionType; amount: number; note: string }
  | { ok: false; reason: 'no_amount' | 'multiple_amounts' | 'invalid_amount' };

// A leading "+" attached to the number marks income; no sign (or "-") means expense.
const NUMBER_PATTERN = /\+?\d+(?:[.,]\d+)?/g;

export function parseTransactionText(text: string): ParseResult {
  const matches = text.match(NUMBER_PATTERN);

  if (!matches || matches.length === 0) {
    return { ok: false, reason: 'no_amount' };
  }

  if (matches.length > 1) {
    return { ok: false, reason: 'multiple_amounts' };
  }

  const raw = matches[0];
  const type: TransactionType = raw.startsWith('+') ? 'income' : 'expense';
  const amount = Number(raw.replace('+', '').replace(',', '.'));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const note = text.replace(raw, '').replace(/\s+/g, ' ').trim();

  return { ok: true, type, amount, note };
}
