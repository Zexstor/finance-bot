import { z } from 'zod';

// Pure logic + schemas for receipt parsing, kept separate from classify-receipt.ts
// (which creates an OpenAI client at import time) so it can be unit-tested without
// any API key or network access.

export const receiptItemSchema = z.object({
  name: z.string(),
  amount: z.number().positive(),
  category: z.string().nullable(),
});

export const receiptSchema = z.object({
  store: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(receiptItemSchema),
});

export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

const SUM_MISMATCH_TOLERANCE_CENTS = 5;

export function isSumMismatched(itemsSum: number, total: number | null): boolean {
  if (total === null) {
    return false;
  }

  // Compare rounded cents, not raw floats: 24.17 - 24.12 is 0.05000000000000071
  // in IEEE754, which would wrongly trip a strict ">" against a 0.05 threshold.
  const diffCents = Math.round(Math.abs(itemsSum - total) * 100);
  return diffCents > SUM_MISMATCH_TOLERANCE_CENTS;
}
