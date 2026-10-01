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
- Сообщения обычно короткие и неформальные: "кофе 3.5", "3.5 кофе", "2 чай",
  "такси 12". Число в любом месте сообщения рядом с названием покупки —
  это почти всегда сумма операции, а не количество штук. Не отказывайся
  распознавать такие сообщения просто потому что порядок слов необычный.
- "type" и "amount" верни null ТОЛЬКО если сообщение вообще не про деньги
  (приветствие, вопрос, разговор ни о чём). Если в сообщении есть число и
  хоть какой-то контекст покупки/поступления — "type" и "amount" ОБЯЗАНЫ
  быть заполнены, даже если ты не уверен в категории.
- "type": "expense" — если это трата, "income" — если поступление денег
  (зарплата, премия, подарок получен и т.п.). По умолчанию, если не ясно — "expense".
- "amount": сумма операции числом, без символов валюты.
- "currency": трёхбуквенный код валюты, если явно упомянута (USD, RUB...).
  Если валюта не указана — верни "EUR" (это бюджет в евро по умолчанию).
- "category": строго одно из названий ниже, дословно. ЭТО ПОЛЕ НЕЗАВИСИМО
  от "type"/"amount" — если ни одна категория не подходит уверенно, верни
  null ТОЛЬКО в "category", а "type" и "amount" всё равно заполни.
- "note": короткая заметка (1-5 слов) о том, на что/от чего операция,
  без суммы и валюты.

Примеры:
"кофе 3.5" -> {"type":"expense","amount":3.5,"currency":"EUR","category":"Кафе и рестораны","note":"кофе"}
"2 чай" -> {"type":"expense","amount":2,"currency":"EUR","category":"Кафе и рестораны","note":"чай"}
"ноутбук 20" -> {"type":"expense","amount":20,"currency":"EUR","category":null,"note":"ноутбук"}
"получил зарплату 1500" -> {"type":"income","amount":1500,"currency":"EUR","category":"Зарплата","note":"зарплата"}
"привет как дела" -> {"type":null,"amount":null,"currency":null,"category":null,"note":""}

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
