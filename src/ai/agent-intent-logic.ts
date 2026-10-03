import { z } from 'zod';

// Pure schema for the "what does this non-transaction message actually want"
// router, kept separate from the OpenAI-calling module so it's unit-tested
// without an API key.

export const agentIntentSchema = z.object({
  intent: z.enum(['edit', 'delete', 'query', 'unclear']),
  transactionId: z.number().nullable(),
  editField: z.enum(['category', 'amount', 'note']).nullable(),
  editValue: z.string().nullable(),
  queryCategory: z.string().nullable(),
  queryPeriod: z.enum(['month', 'week']).nullable(),
});

export type AgentIntent = z.infer<typeof agentIntentSchema>;

export interface RecentTransactionForPrompt {
  id: number;
  type: 'expense' | 'income';
  amount: number;
  categoryName: string | null;
  description: string | null;
  created_at: string;
}

export function formatRecentTransactionsForPrompt(items: RecentTransactionForPrompt[]): string {
  if (items.length === 0) {
    return '(нет недавних операций)';
  }

  return items
    .map((t) => {
      const date = new Date(t.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      const typeLabel = t.type === 'income' ? 'доход' : 'расход';
      const category = t.categoryName ?? 'без категории';
      const note = t.description || 'без заметки';
      return `id=${t.id} | ${date} | ${typeLabel} | ${t.amount.toFixed(2)} € | ${category} | ${note}`;
    })
    .join('\n');
}
