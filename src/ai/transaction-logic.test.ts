import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificationSchema } from './transaction-logic.js';

test('classificationSchema: accepts the "not about money" empty-array case', () => {
  const parsed = classificationSchema.parse({ transactions: [] });
  assert.deepEqual(parsed.transactions, []);
});

test('classificationSchema: accepts multiple transactions in one message', () => {
  const parsed = classificationSchema.parse({
    transactions: [
      { type: 'expense', amount: 3.5, currency: 'EUR', category: 'Кафе и рестораны', note: 'кофе' },
      { type: 'expense', amount: 12, currency: 'EUR', category: 'Транспорт', note: 'такси' },
    ],
  });
  assert.equal(parsed.transactions.length, 2);
});

test('classificationSchema: accepts a null category (uncertain) but requires type/amount', () => {
  const parsed = classificationSchema.parse({
    transactions: [{ type: 'expense', amount: 20, currency: 'EUR', category: null, note: 'ноутбук' }],
  });
  assert.equal(parsed.transactions[0].category, null);
});

test('classificationSchema: rejects an invalid type value', () => {
  assert.throws(() =>
    classificationSchema.parse({
      transactions: [{ type: 'refund', amount: 5, currency: 'EUR', category: null, note: '' }],
    }),
  );
});

test('classificationSchema: rejects a zero or negative amount', () => {
  assert.throws(() =>
    classificationSchema.parse({
      transactions: [{ type: 'expense', amount: 0, currency: 'EUR', category: null, note: '' }],
    }),
  );
});

test('classificationSchema: rejects a missing currency field', () => {
  assert.throws(() =>
    classificationSchema.parse({ transactions: [{ type: 'expense', amount: 5, category: null, note: '' }] }),
  );
});
