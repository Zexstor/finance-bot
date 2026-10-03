import type { TransactionUpdate } from '../services/transactions.js';
import type { SheetRowEdits } from '../integrations/google-sheets.js';

// The Google Sheets template has no transaction-id column, so syncing an
// edit/delete there requires the ORIGINAL type/amount/description to locate
// the row -- captured here at confirmation-prompt time, before the DB value
// changes underneath it.
export interface SheetRowOriginal {
  type: 'expense' | 'income';
  amount: number;
  description: string | null;
}

interface PendingAgentAction {
  kind: 'edit' | 'delete';
  transactionId: number;
  patch: TransactionUpdate | null; // null for delete
  sheetEdits: SheetRowEdits | null; // null for delete
  summary: string;
  original: SheetRowOriginal;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const pending = new Map<number, PendingAgentAction>();

export function setPendingAgentAction(userId: number, data: Omit<PendingAgentAction, 'expiresAt'>): void {
  pending.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePendingAgentAction(userId: number): PendingAgentAction | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry;
}
