import { z } from 'zod';
import { openai } from './client.js';
import { env } from '../config/env.js';
import type { Category } from '../types/db.js';
import { transactionItemSchema } from './transaction-logic.js';

export type TransactionItem = z.infer<typeof transactionItemSchema>;

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
пользователя на русском языке в свободной форме. В нём может быть описана
ОДНА денежная операция или НЕСКОЛЬКО сразу (например, перечисление через
запятую, "и", или просто несколько покупок подряд).

Извлеки структурированные данные и верни ТОЛЬКО JSON без пояснений, по схеме:

{
  "transactions": [
    { "type": "expense" | "income", "amount": number, "currency": string, "category": string | null, "note": string }
  ]
}

Правила:
- Каждая отдельная покупка или поступление денег — это отдельный элемент
  массива "transactions". Если в сообщении только одна операция — массив
  из одного элемента.
- Если сообщение вообще не про деньги (приветствие, вопрос, разговор
  ни о чём) — верни "transactions": [] (пустой массив).
- Если сообщение говорит про УЖЕ существующую операцию — просит исправить
  категорию/сумму/заметку, удалить запись, или спрашивает про прошлые траты
  ("ты поставил не ту категорию", "удали запись про X", "сколько я потратил
  на еду") — это НЕ новая операция. Верни "transactions": [] (пустой
  массив), даже если в сообщении упомянуты суммы или название покупки.
- Сообщения обычно короткие и неформальные: "кофе 3.5", "3.5 кофе", "2 чай",
  "такси 12", "кофе 3.5, такси 12". Число рядом с названием покупки —
  это почти всегда сумма операции, а не количество штук. Не отказывайся
  распознавать такие сообщения просто потому что порядок слов необычный.
- "type": "expense" — если это трата, "income" — если поступление денег
  (зарплата, премия, подарок получен и т.п.). По умолчанию, если не ясно — "expense".
- "amount": сумма операции числом, без символов валюты.
- "currency": трёхбуквенный код валюты, если явно упомянута (USD, RUB...).
  Если валюта не указана — верни "EUR" (это бюджет в евро по умолчанию).
- "category": строго одно из названий ниже, дословно. «Продукты и БХ»
  (БХ — бытовая химия) покрывает не только еду, но и мелкие хозяйственные
  товары из продуктового магазина: пакеты, фольга, салфетки, моющие
  средства и т.п. «Для дома» — это про другие покупки для дома (не из
  продуктового магазина). Это поле независимо от остальных — если ни одна
  категория не подходит уверенно, верни null ТОЛЬКО в "category".
- "note": короткая заметка (1-5 слов) о том, на что/от чего операция,
  без суммы и валюты.

Примеры:
"кофе 3.5" -> {"transactions":[{"type":"expense","amount":3.5,"currency":"EUR","category":"Кафе и рестораны","note":"кофе"}]}
"2 чай" -> {"transactions":[{"type":"expense","amount":2,"currency":"EUR","category":"Кафе и рестораны","note":"чай"}]}
"ноутбук 20" -> {"transactions":[{"type":"expense","amount":20,"currency":"EUR","category":null,"note":"ноутбук"}]}
"получил зарплату 1500" -> {"transactions":[{"type":"income","amount":1500,"currency":"EUR","category":"Зарплата","note":"зарплата"}]}
"кофе 3.5, такси 12" -> {"transactions":[{"type":"expense","amount":3.5,"currency":"EUR","category":"Кафе и рестораны","note":"кофе"},{"type":"expense","amount":12,"currency":"EUR","category":"Транспорт","note":"такси"}]}
"привет как дела" -> {"transactions":[]}

Категории расходов (только если type="expense"):
${expenseNames}.

Категории доходов (только если type="income"):
${incomeNames}.`;
}

export async function classifyTransactions(text: string, categories: Category[]): Promise<TransactionItem[]> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: buildSystemPrompt(categories) },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'transactions_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['expense', 'income'] },
                  amount: { type: 'number' },
                  currency: { type: 'string' },
                  category: { type: ['string', 'null'] },
                  note: { type: 'string' },
                },
                required: ['type', 'amount', 'currency', 'category', 'note'],
                additionalProperties: false,
              },
            },
          },
          required: ['transactions'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty AI response');
  }

  // Validate item-by-item and drop anything malformed (e.g. amount <= 0,
  // which OpenAI's own JSON-schema mode doesn't enforce, only our zod
  // schema does) instead of letting one bad item throw away the whole
  // message -- a schema failure here used to surface to the user as a
  // generic "не получилось обработать сообщение", even for messages that
  // were never meant to be a new transaction (e.g. a correction request the
  // model misfired on).
  const raw: unknown = JSON.parse(content);
  const rawTransactions =
    raw !== null && typeof raw === 'object' && Array.isArray((raw as { transactions?: unknown }).transactions)
      ? (raw as { transactions: unknown[] }).transactions
      : [];

  const valid: TransactionItem[] = [];
  for (const item of rawTransactions) {
    const result = transactionItemSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      console.error('classifyTransactions: dropping invalid item:', result.error.message);
    }
  }

  return valid;
}
