import type { TransactionType } from '../types/db.js';

interface PendingCategoryInput {
  type: TransactionType;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const pending = new Map<number, PendingCategoryInput>();

export function setPendingCategoryType(userId: number, type: TransactionType): void {
  pending.set(userId, { type, expiresAt: Date.now() + TTL_MS });
}

export function takePendingCategoryType(userId: number): TransactionType | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.type;
}
