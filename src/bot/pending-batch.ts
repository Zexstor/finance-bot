import type { TransactionType, TransactionSource } from '../types/db.js';

export interface PendingBatchItem {
  type: TransactionType;
  amount: number;
  note: string;
  categoryId: number | null;
  categoryName: string | null;
}

interface PendingBatch {
  items: PendingBatchItem[];
  source: TransactionSource;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const pending = new Map<number, PendingBatch>();

export function setPendingBatch(userId: number, data: Omit<PendingBatch, 'expiresAt'>): void {
  pending.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePendingBatch(userId: number): PendingBatch | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry;
}
