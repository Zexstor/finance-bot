import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateForTelegram, formatBalanceLine, formatQueryAnswer } from './format.js';

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

const CATEGORIES = [
  { name: 'Кафе и рестораны', total: 25.5 },
  { name: 'Транспорт', total: 10 },
];

test('formatQueryAnswer: specific category returns its own total', () => {
  const answer = formatQueryAnswer('этот месяц', 500, 100, CATEGORIES, 'Транспорт');
  assert.equal(answer, 'Расходы на «Транспорт» за этот месяц: 10.00 €');
});

test('formatQueryAnswer: category lookup is case-insensitive', () => {
  const answer = formatQueryAnswer('этот месяц', 500, 100, CATEGORIES, 'транспорт');
  assert.equal(answer, 'Расходы на «транспорт» за этот месяц: 10.00 €');
});

test('formatQueryAnswer: unknown category returns zero, not an error', () => {
  const answer = formatQueryAnswer('этот месяц', 500, 100, CATEGORIES, 'Одежда');
  assert.equal(answer, 'Расходы на «Одежда» за этот месяц: 0.00 €');
});

test('formatQueryAnswer: no category gives the overall summary with balance', () => {
  const answer = formatQueryAnswer('этот месяц', 500, 100, CATEGORIES, null);
  assert.equal(answer, 'За этот месяц: доход 500.00 €, расход 100.00 €, остаток 400.00 €');
});

test('formatQueryAnswer: overall summary shows "перерасход" when expenses exceed income', () => {
  const answer = formatQueryAnswer('этот месяц', 50, 100, CATEGORIES, null);
  assert.equal(answer, 'За этот месяц: доход 50.00 €, расход 100.00 €, перерасход 50.00 €');
});
