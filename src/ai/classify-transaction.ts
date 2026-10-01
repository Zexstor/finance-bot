import { z } from 'zod';
import { openai } from './client.js';
import { env } from '../config/env.js';
import type { Category } from '../types/db.js';

const classificationSchema = z.object({
  type: z.enum(['expense', 'income']).nullable(),
  amount: z.number().positive().nullable(),
  currency: z.string().nullable(),
  category: z.string().nullable(),
  note: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;

function buildSystemPrompt(categories: Category[]): string {
  const expenseNames = categories
    .filter((c) => c.type === 'expense')
    .map((c) => c.name)
    .join(', ');
  const incomeNames = categories
    .filter((c) => c.type === 'income')
    .map((c) => c.name)
    .join(', ');

  return `Ты — помощник семейного финансового бота. Тебе присылают одно сообщение
пользователя о денежной операции на русском языке в свободной форме.
Извлеки структурированные данные и верни ТОЛЬКО JSON без пояснений, по схеме:

{
  "type": "expense" | "income" | null,
  "amount": number | null,
  "currency": string | null,
  "category": string | null,
  "note": string
}

Правила:
- "type": "expense" — если это трата, "income" — если поступление денег.
  Если сообщение вообще не про деньги — верни null во всех полях, кроме note
  (note оставь пустой строкой).
- "amount": сумма операции числом, без символов валюты. Если число нельзя
  однозначно определить — null.
- "currency": трёхбуквенный код валюты, если явно упомянута (USD, RUB...).
  Если валюта не указана — верни "EUR" (это бюджет в евро по умолчанию).
- "category": строго одно из названий ниже, дословно. Если ни одна категория
  не подходит уверенно — верни null, не угадывай.
- "note": короткая заметка (1-5 слов) о том, на что/от чего операция,
  без суммы и валюты.

Категории расходов (только если type="expense"):
${expenseNames}.

Категории доходов (только если type="income"):
${incomeNames}.`;
}

export async function classifyTransaction(text: string, categories: Category[]): Promise<Classification> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(categories) },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'transaction_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            type: { type: ['string', 'null'], enum: ['expense', 'income', null] },
            amount: { type: ['number', 'null'] },
            currency: { type: ['string', 'null'] },
            category: { type: ['string', 'null'] },
            note: { type: 'string' },
          },
          required: ['type', 'amount', 'currency', 'category', 'note'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty AI response');
  }

  return classificationSchema.parse(JSON.parse(content));
}
