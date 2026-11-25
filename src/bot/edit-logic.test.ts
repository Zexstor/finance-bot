import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editCallback,
  parseEditCallback,
  parseAmountInput,
  normalizeDescriptionInput,
  formatEditButtonLabel,
  formatTransactionCard,
  autoInvestReminder,
  MAX_DESCRIPTION_LENGTH,
  type EditableTransaction,
} from './edit-logic.js';
import {
  setPendingEditInput,
  takePendingEditInput,
  clearPendingEditInput,
} from './pending-edit-input.js';

const sample: EditableTransaction = {
  id: 272,
  type: 'expense',
  amount: 25,
  description: 'еда',
  created_at: '2026-11-20T20:04:00Z',
  authorName: 'Павел',
  categoryName: 'Продукты и БХ',
};

test('callbacks: every builder round-trips through the parser', () => {
  assert.deepEqual(parseEditCallback(editCallback.list()), { kind: 'list' });
  assert.deepEqual(parseEditCallback(editCallback.close()), { kind: 'close' });
  assert.deepEqual(parseEditCallback(editCallback.open(272)), { kind: 'open', id: 272 });
  for (const field of ['category', 'description', 'amount'] as const) {
    assert.deepEqual(parseEditCallback(editCallback.field(272, field)), {
      kind: 'field',
      id: 272,
      field,
    });
  }
  assert.deepEqual(parseEditCallback(editCallback.setCategory(272, 5)), {
    kind: 'setCategory',
    id: 272,
    categoryId: 5,
  });
  assert.deepEqual(parseEditCallback(editCallback.setCategory(272, null)), {
    kind: 'setCategory',
    id: 272,
    categoryId: null,
  });
});

test('callbacks: stay under Telegram 64-byte limit even for huge ids', () => {
  const big = 9_999_999_999;
  for (const data of [
    editCallback.open(big),
    editCallback.field(big, 'description'),
    editCallback.setCategory(big, big),
  ]) {
    assert.ok(Buffer.byteLength(data) <= 64, data);
  }
});

test('callbacks: malformed or foreign data is rejected', () => {
  for (const data of [
    'ed:o:',
    'ed:o:abc',
    'ed:o:0',
    'ed:o:-1',
    'ed:f:1:z',
    'ed:c:1',
    'ed:c:1:x',
    'ed:l:1',
    'cat:5',
    'agent:confirm',
  ]) {
    assert.equal(parseEditCallback(data), null, data);
  }
});

test('parseAmountInput: accepts the usual ways of typing an amount', () => {
  assert.equal(parseAmountInput('12.5'), 12.5);
  assert.equal(parseAmountInput('12,5'), 12.5);
  assert.equal(parseAmountInput(' 12 '), 12);
  assert.equal(parseAmountInput('12 €'), 12);
  assert.equal(parseAmountInput('12eur'), 12);
  assert.equal(parseAmountInput('1 250,40'), 1250.4);
  assert.equal(parseAmountInput('0.005'), 0.01);
});

test('parseAmountInput: rejects non-amounts instead of saving garbage', () => {
  for (const text of ['', 'abc', '0', '0,00', '-5', '12.5.3', 'двенадцать', '5+5', '2000000']) {
    assert.equal(parseAmountInput(text), null, text);
  }
});

test('normalizeDescriptionInput: trims, collapses spaces, caps length, rejects empty', () => {
  assert.equal(normalizeDescriptionInput('  кафе   зебра \n'), 'кафе зебра');
  assert.equal(normalizeDescriptionInput('   '), null);
  assert.equal(normalizeDescriptionInput('x'.repeat(500))?.length, MAX_DESCRIPTION_LENGTH);
});

test('formatEditButtonLabel: date in app time zone, amount, category, description', () => {
  assert.equal(formatEditButtonLabel(sample), '20.11 ➖ 25.00 € · Продукты и БХ · еда');
});

test('formatEditButtonLabel: a just-after-midnight entry shows the local date', () => {
  // 23:30 UTC on Oct 31 is 00:30 on Nov 1 in Podgorica.
  const label = formatEditButtonLabel({ ...sample, created_at: '2026-10-31T23:30:00Z' });
  assert.ok(label.startsWith('01.11 '), label);
});

test('formatEditButtonLabel: long labels are cut with an ellipsis', () => {
  const label = formatEditButtonLabel({ ...sample, description: 'очень '.repeat(30) });
  assert.ok(label.length <= 60, String(label.length));
  assert.ok(label.endsWith('…'));
});

test('formatEditButtonLabel: missing category and description', () => {
  assert.equal(
    formatEditButtonLabel({ ...sample, type: 'income', categoryName: null, description: null }),
    '20.11 ➕ 25.00 € · Без категории',
  );
});

test('formatTransactionCard: shows all editable fields', () => {
  const card = formatTransactionCard(sample);
  assert.match(card, /➖ Расход от 20\.11\.2026 \(Павел\)/);
  assert.match(card, /Сумма: 25\.00 €/);
  assert.match(card, /Категория: Продукты и БХ/);
  assert.match(card, /Описание: еда/);
});

test('autoInvestReminder: only for an income whose amount changed', () => {
  assert.equal(autoInvestReminder('expense', 500, 550), null);
  assert.equal(autoInvestReminder('income', 500, 500), null);
  const text = autoInvestReminder('income', 500, 550);
  assert.ok(text?.includes('было 50.00 €') && text.includes('10% = 55.00 €'), text ?? '');
});

test('pending-edit-input: take returns the entry once; clear drops it', () => {
  setPendingEditInput(910001, { transactionId: 7, field: 'amount' });
  assert.deepEqual(takePendingEditInput(910001), { transactionId: 7, field: 'amount' });
  assert.equal(takePendingEditInput(910001), null);

  setPendingEditInput(910002, { transactionId: 8, field: 'description' });
  clearPendingEditInput(910002);
  assert.equal(takePendingEditInput(910002), null);
});
