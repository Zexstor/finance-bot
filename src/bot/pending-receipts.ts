export interface PendingReceiptItem {
  name: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
}

interface PendingReceipt {
  imageBuffer: Buffer;
  storeName: string | null;
  totalAmount: number | null;
  items: PendingReceiptItem[];
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const pending = new Map<number, PendingReceipt>();

export function setPendingReceipt(userId: number, data: Omit<PendingReceipt, 'expiresAt'>): void {
  pending.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePendingReceipt(userId: number): PendingReceipt | null {
  const entry = pending.get(userId);
  pending.delete(userId);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry;
}

// Non-consuming check, used to warn about (rather than silently discard) an
// unconfirmed receipt when a new photo arrives before it's been dealt with.
export function hasPendingReceipt(userId: number): boolean {
  const entry = pending.get(userId);
  return entry !== undefined && entry.expiresAt >= Date.now();
}
