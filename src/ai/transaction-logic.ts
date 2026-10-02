import { z } from 'zod';

// Pure schema, kept separate from classify-transaction.ts (which creates an
// OpenAI client at import time) so it can be unit-tested without any API key.

export const transactionItemSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: z.string(),
  category: z.string().nullable(),
  note: z.string(),
});

export const classificationSchema = z.object({
  transactions: z.array(transactionItemSchema),
});
