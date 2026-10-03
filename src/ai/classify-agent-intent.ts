import { openai } from './client.js';
import { env } from '../config/env.js';
import type { Category } from '../types/db.js';
import {
  agentIntentSchema,
  formatRecentTransactionsForPrompt,
  type AgentIntent,
  type RecentTransactionForPrompt,
} from './agent-intent-logic.js';

function buildPrompt(categories: Category[], recent: RecentTransactionForPrompt[]): string {
  const expenseNames = categories
    .filter((c) => c.type === 'expense')
    .map((c) => c.name)
    .join(', ');
  const incomeNames = categories
    .filter((c) => c.type === 'income')
    .map((c) => c.name)
    .join(', ');

  return `Ты — помощник семейного финансового бота. Пользователь написал сообщение,
которое НЕ похоже на новую операцию (сумму в нём распознать не удалось).
Разберись, чего он хочет, и верни ТОЛЬКО JSON без пояснений:

{
  "intent": "edit" | "delete" | "query" | "unclear",
  "transactionId": number | null,
  "editField": "category" | "amount" | "note" | null,
  "editValue": string | null,
  "queryCategory": string | null,
  "queryPeriod": "month" | "week" | null
}

Правила:
- "edit" — пользователь просит исправить категорию/сумму/заметку у ОДНОЙ
  из операций ниже (например "ты поставил не ту категорию для кофе",
  "у последней операции сумма неправильная, там 15"). Укажи "transactionId"
  из списка ниже (то, что он скорее всего имеет в виду — по описанию, сумме
  или "последняя"), "editField" и "editValue" (новое значение: для category —
  точное название из списка категорий, для amount — число, для note — текст).
- "delete" — просит удалить/отменить конкретную операцию ("удали запись про
  такси", "убери вчерашний кофе"). Укажи "transactionId".
- "query" — вопрос про расходы/доходы ("сколько я потратил на еду",
  "сколько дохода в этом месяце"). "queryCategory" — название категории,
  если спрашивает про конкретную, иначе null. "queryPeriod" — "month" или
  "week" (по умолчанию "month", если не уточнил).
- "unclear" — сообщение вообще не про финансы бота (приветствие, болтовня,
  вопрос не по теме). Остальные поля — null.
- Если не уверен, к какой именно операции относится edit/delete — всё равно
  выбери наиболее вероятный "transactionId" (пользователь проверит и
  подтвердит кнопкой перед тем, как что-то изменится).

Категории расходов: ${expenseNames}.
Категории доходов: ${incomeNames}.

Последние операции пользователя (от новых к старым):
${formatRecentTransactionsForPrompt(recent)}`;
}

export async function classifyAgentIntent(
  text: string,
  categories: Category[],
  recent: RecentTransactionForPrompt[],
): Promise<AgentIntent> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: buildPrompt(categories, recent) },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'agent_intent',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            intent: { type: 'string', enum: ['edit', 'delete', 'query', 'unclear'] },
            transactionId: { type: ['number', 'null'] },
            editField: { type: ['string', 'null'], enum: ['category', 'amount', 'note', null] },
            editValue: { type: ['string', 'null'] },
            queryCategory: { type: ['string', 'null'] },
            queryPeriod: { type: ['string', 'null'], enum: ['month', 'week', null] },
          },
          required: ['intent', 'transactionId', 'editField', 'editValue', 'queryCategory', 'queryPeriod'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty AI response');
  }

  return agentIntentSchema.parse(JSON.parse(content));
}
