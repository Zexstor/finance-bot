const TTL_MS = 60 * 60 * 1000;
const pending = new Map<number, { categoryId: number; expiresAt: number }>();

export function setPendingCategoryGoalInput(userId: number, categoryId: number): void {
  pending.set(userId, { categoryId, expiresAt: Date.now() + TTL_MS });
}

export function takePendingCategoryGoalInput(userId: number): number | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.categoryId;
}
