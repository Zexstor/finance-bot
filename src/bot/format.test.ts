import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateForTelegram } from './format.js';

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
