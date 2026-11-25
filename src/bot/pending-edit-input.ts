// "Waiting for the user to type a new description/amount" state for the /list
// editor. In-memory like the other pending-* stores (lost on restart). A
// shorter TTL than the others: if the user wanders off, their next ordinary
// message should be recorded as a transaction, not swallowed as an edit.

export interface PendingEditInput {
  transactionId: number;
  field: 'description' | 'amount';
}

interface Entry extends PendingEditInput {
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const pending = new Map<number, Entry>();

export function setPendingEditInput(userId: number, data: PendingEditInput): void {
  pending.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePendingEditInput(userId: number): PendingEditInput | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return { transactionId: entry.transactionId, field: entry.field };
}

export function clearPendingEditInput(userId: number): void {
  pending.delete(userId);
}
