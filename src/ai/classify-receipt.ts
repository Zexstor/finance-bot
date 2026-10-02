import { z } from 'zod';
import { openai } from './client.js';
import { env } from '../config/env.js';
import type { Category } from '../types/db.js';

const receiptItemSchema = z.object({
  name: z.string(),
  amount: z.number().positive(),
  category: z.string().nullable(),
});

const receiptSchema = z.object({
  store: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(receiptItemSchema),
});

export type ReceiptClassification = z.infer<typeof receiptSchema> & { lowConfidence: boolean };

async function transcribeReceiptText(imageBuffer: Buffer): Promise<string> {
  const base64Image = imageBuffer.toString('base64');

  // Receipt photos often have small, angled, low-contrast text where
  // gpt-4o-mini misreads digits; OPENAI_RECEIPT_MODEL defaults to the full
  // gpt-4o, which reads them far more reliably. The cheaper OPENAI_MODEL is
  // still used for the text-only classification step below.
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_RECEIPT_MODEL,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Ты расшифровываешь текст с фото кассового чека. Перепиши ВЕСЬ видимый текст ' +
          'чека построчно, максимально точно, включая все числа и символы (X, %, запятые, точки). ' +
          'Не переводи, не структурируй, не пропускай строки и не объединяй их. Каждая строка чека — ' +
          'отдельная строка в твоём ответе. Без пояснений, только текст чека.\n\n' +
          'Если две соседние строки с товарами выглядят ОДИНАКОВО (одинаковое название, количество ' +
          'и цена) — это НЕ ошибка печати и не дубль одной и той же строки. На чеке это означает, что ' +
          'товар купили отдельными позициями дважды. Перепиши ОБЕ строки, не удаляй и не объединяй ' +
          'повторяющиеся строки.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' },
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty transcription response');
  }

  return content;
}

function buildClassificationPrompt(expenseCategories: Category[]): string {
  const expenseNames = expenseCategories.map((c) => c.name).join(', ');

  return `Ты — помощник семейного финансового бота. Тебе присылают расшифрованный
текстом кассовый чек из магазина в Черногории (на черногорском языке, обычно латиница).

Извлеки данные и переведи названия магазина и товаров на русский язык.
Верни ТОЛЬКО JSON без пояснений, по схеме:

{
  "store": string | null,
  "total": number | null,
  "items": [
    { "name": string, "amount": number, "category": string | null }
  ]
}

Формат черногорских фискальных чеков (важно понимать правильно):
Каждый товар занимает ДВЕ строки:
  Строка 1: код товара и его название, например "28670 - CURECI FILE svjezi"
  Строка 2: количество, затем "X", затем цена за единицу, затем НДС,
            и В САМОМ КОНЦЕ строки — итоговая цена этой позиции, например:
            "0.496 KG  X  15.00  pdv7%  7.44"
В этом примере 0.496 — это количество (кг), 15.00 — цена за килограмм,
а 7.44 (последнее число в строке, правее всех) — это и есть сумма, которую
нужно взять как "amount" для этого товара. Количество и цену за единицу
в "amount" использовать НЕЛЬЗЯ — только последнее число в строке.

Один товар = одна строка с кодом и названием = один элемент "items".
Если товар с одинаковым названием встречается в чеке дважды на разных
строках — это два отдельных элемента, не объединяй их.

В конце чека есть строка типа "ZA PLAĆANJE", "UKUPNO" или "Kartica" с
общей суммой к оплате — это "total", а не отдельная позиция товара.

После того как извлёк все позиции, проверь себя: сумма всех "amount" из
"items" должна точно совпадать с "total" (в пределах нескольких центов на
округление). Если не совпадает — перепроверь каждую строку с товаром,
возможно взял не последнее число в строке или пропустил позицию.

Правила:
- "store": название магазина на русском (известные сети можно оставить
  транслитерацией). Если не удалось прочитать — null.
- "total": итоговая сумма чека (см. выше), если она есть в тексте. Иначе null.
- "items": КАЖДАЯ отдельная позиция из чека (см. формат выше):
  - "name" — название товара, переведённое на русский язык, коротко (1-4 слова)
  - "amount" — ИТОГОВАЯ цена этой позиции (последнее число в её строке),
    в евро (на черногорских чеках валюта всегда евро)
  - "category" — строго одно из названий ниже, дословно. «Продукты и БХ»
    (БХ — бытовая химия) покрывает не только еду, но и мелкие хозяйственные
    товары, купленные в продуктовом магазине: пакеты, фольга, салфетки,
    моющие средства и т.п. «Для дома» — это про другие покупки для дома
    (не из продуктового магазина). Если ни одна категория не подходит
    уверенно — верни null, не угадывай. Это поле
    независимо от остальных: не уверен в категории одной позиции — всё
    равно верни её "name" и "amount".
- Если текст вообще не похож на чек — верни "store": null, "total": null, "items": [].

Категории расходов:
${expenseNames}.`;
}

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

export async function classifyReceipt(
  imageBuffer: Buffer,
  expenseCategories: Category[],
): Promise<ReceiptClassification> {
  // Vision OCR on dense receipt text isn't fully deterministic even at
  // temperature 0 (seen in practice: two adjacent similar-looking product
  // lines occasionally get merged/mislabeled, with the item sum still
  // accidentally matching the receipt total). Reading twice and comparing
  // catches that case, which a pure sum check cannot.
  const [transcriptA, transcriptB] = await Promise.all([
    transcribeReceiptText(imageBuffer),
    transcribeReceiptText(imageBuffer),
  ]);
  const lowConfidence = normalizeTranscript(transcriptA) !== normalizeTranscript(transcriptB);
  const transcript = transcriptA;

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: buildClassificationPrompt(expenseCategories) },
      { role: 'user', content: transcript },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'receipt_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            store: { type: ['string', 'null'] },
            total: { type: ['number', 'null'] },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  amount: { type: 'number' },
                  category: { type: ['string', 'null'] },
                },
                required: ['name', 'amount', 'category'],
                additionalProperties: false,
              },
            },
          },
          required: ['store', 'total', 'items'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty AI response');
  }

  return { ...receiptSchema.parse(JSON.parse(content)), lowConfidence };
}
