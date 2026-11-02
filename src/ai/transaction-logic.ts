import { z } from 'zod';

// Pure schema, kept separate from classify-transaction.ts (which creates an
// OpenAI client at import time) so it can be unit-tested without any API key.

export const transactionItemSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: z.string(),
  category: z.string().nullable(),
  note: z.string(),
  // Absolute date "YYYY-MM-DD" the user named for this operation, or null when
  // they named none (then it defaults to today). Kept lenient here; the bot
  // ignores anything that isn't a well-formed date.
  date: z.string().nullable(),
});

export const classificationSchema = z.object({
  transactions: z.array(transactionItemSchema),
});
