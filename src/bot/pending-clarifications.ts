import type { TransactionType } from '../types/db.js';

interface PendingClarification {
  type: TransactionType;
  amount: number;
  note: string;
  categories: { id: number; name: string }[];
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const pending = new Map<number, PendingClarification>();

export function setPending(userId: number, data: Omit<PendingClarification, 'expiresAt'>): void {
  pending.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePending(userId: number): PendingClarification | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry;
}
