import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateForTelegram, formatBalanceLine } from './format.js';

test('truncateForTelegram: short text passes through unchanged', () => {
  assert.equal(truncateForTelegram('кофе 3.5'), 'кофе 3.5');
});

test('truncateForTelegram: text at exactly the limit passes through unchanged', () => {
  const text = 'a'.repeat(100);
  assert.equal(truncateForTelegram(text, 100), text);
});

test('truncateForTelegram: text over the limit gets cut and annotated', () => {
  const text = 'a'.repeat(150);
  const result = truncateForTelegram(text, 100);
  assert.ok(result.startsWith('a'.repeat(100)));
  assert.ok(result.includes('обрезано'));
  assert.ok(result.length < text.length + 100);
});

test('formatBalanceLine: positive balance labeled "Остаток"', () => {
  assert.equal(formatBalanceLine(300), 'Остаток за месяц: 300.00 €');
});

test('formatBalanceLine: zero balance labeled "Остаток" (not overspend)', () => {
  assert.equal(formatBalanceLine(0), 'Остаток за месяц: 0.00 €');
});

test('formatBalanceLine: negative balance labeled "Перерасход" with absolute value', () => {
  assert.equal(formatBalanceLine(-45.5), 'Перерасход за месяц: 45.50 €');
});
