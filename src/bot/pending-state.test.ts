import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPending, takePending } from './pending-clarifications.js';
import { setPendingCategoryType, takePendingCategoryType } from './pending-category-input.js';
import { setPendingReceipt, takePendingReceipt } from './pending-receipts.js';
import { setPendingBatch, takePendingBatch } from './pending-batch.js';

// All four pending-* stores share the same "take once" contract: a button
// click (confirm/cancel) must consume the entry so a double-tap, or a click
// on a stale earlier message, can never apply twice or silently reuse data
// meant for a different message.

test('pending-clarifications: take returns the data once, then null', () => {
  const userId = 900001;
  setPending(userId, {
    type: 'expense',
    amount: 3.5,
    note: 'кофе',
    source: 'text',
    categories: [{ id: 1, name: 'Кафе и рестораны' }],
  });

  const first = takePending(userId);
  assert.equal(first?.amount, 3.5);

  const second = takePending(userId);
  assert.equal(second, null);
});

test('pending-clarifications: unknown user returns null', () => {
  assert.equal(takePending(900002), null);
});

test('pending-category-input: take returns the type once, then null', () => {
  const userId = 900003;
  setPendingCategoryType(userId, 'income');

  assert.equal(takePendingCategoryType(userId), 'income');
  assert.equal(takePendingCategoryType(userId), null);
});

test('pending-receipts: take returns the data once, then null', () => {
  const userId = 900004;
  setPendingReceipt(userId, {
    imageBuffer: Buffer.from('fake-jpeg-bytes'),
    storeName: 'Mega Mall',
    totalAmount: 24.12,
    items: [{ name: 'Хлеб', amount: 1.2, categoryId: 1, categoryName: 'Продукты и БХ' }],
  });

  const first = takePendingReceipt(userId);
  assert.equal(first?.storeName, 'Mega Mall');
  assert.equal(first?.items.length, 1);

  assert.equal(takePendingReceipt(userId), null);
});

test('pending-batch: take returns the data once, then null', () => {
  const userId = 900005;
  setPendingBatch(userId, {
    source: 'voice',
    items: [
      { type: 'expense', amount: 3.5, note: 'кофе', categoryId: 1, categoryName: 'Кафе и рестораны' },
      { type: 'expense', amount: 12, note: 'такси', categoryId: null, categoryName: null },
    ],
  });

  const first = takePendingBatch(userId);
  assert.equal(first?.items.length, 2);
  assert.equal(first?.source, 'voice');

  assert.equal(takePendingBatch(userId), null);
});

test('pending-batch: a second photo/message for the same user overwrites the first pending entry', () => {
  const userId = 900006;
  setPendingBatch(userId, { source: 'text', items: [{ type: 'expense', amount: 1, note: 'a', categoryId: null, categoryName: null }] });
  setPendingBatch(userId, { source: 'text', items: [{ type: 'expense', amount: 2, note: 'b', categoryId: null, categoryName: null }] });

  const result = takePendingBatch(userId);
  assert.equal(result?.items[0]?.amount, 2);
});
