const TTL_MS = 60 * 60 * 1000;

export interface PendingBalanceInput {
  year: number;
  month: number;
}

const pending = new Map<number, PendingBalanceInput & { expiresAt: number }>();

export function setPendingBalanceInput(userId: number, target: PendingBalanceInput): void {
  pending.set(userId, { ...target, expiresAt: Date.now() + TTL_MS });
}

export function takePendingBalanceInput(userId: number): PendingBalanceInput | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return { year: entry.year, month: entry.month };
}
