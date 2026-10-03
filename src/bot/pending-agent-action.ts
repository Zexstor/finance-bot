import type { TransactionUpdate } from '../services/transactions.js';

interface PendingAgentAction {
  kind: 'edit' | 'delete';
  transactionId: number;
  patch: TransactionUpdate | null; // null for delete
  summary: string;
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
