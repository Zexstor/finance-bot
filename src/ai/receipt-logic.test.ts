import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranscript, isSumMismatched, receiptSchema } from './receipt-logic.js';

test('normalizeTranscript: identical text with different whitespace/case is equal', () => {
  const a = 'CURECI FILE svjezi\n0.496 KG X 15.00 pdv7% 7.44';
  const b = '  cureci   file  svjezi \n 0.496   kg x 15.00    pdv7%   7.44  ';
  assert.equal(normalizeTranscript(a), normalizeTranscript(b));
});

test('normalizeTranscript: a genuinely missing line makes transcripts differ', () => {
  const a = '51984 - EDAMER 40% MM\n0.230 KG X 7.99 1.84\n51984 - EDAMER 40% MM\n0.230 KG X 7.99 1.84';
  const b = '51984 - EDAMER 40% MM\n0.230 KG X 7.99 1.84';
  assert.notEqual(normalizeTranscript(a), normalizeTranscript(b));
});

test('normalizeTranscript: a changed digit makes transcripts differ', () => {
  const a = 'KESA VELIKA 1.000 KOM X 0.15 0.15';
  const b = 'KESA VELIKA 1.000 KOM X 2.00 2.00';
  assert.notEqual(normalizeTranscript(a), normalizeTranscript(b));
});

test('isSumMismatched: exact match is not a mismatch', () => {
  assert.equal(isSumMismatched(24.12, 24.12), false);
});

test('isSumMismatched: within rounding tolerance (<= 5 cents) is not a mismatch', () => {
  assert.equal(isSumMismatched(24.1, 24.12), false);
  assert.equal(isSumMismatched(24.17, 24.12), false);
});

test('isSumMismatched: beyond tolerance is a mismatch', () => {
  assert.equal(isSumMismatched(22.28, 24.12), true);
  assert.equal(isSumMismatched(31.62, 19.44), true);
});

test('isSumMismatched: null total (receipt has no visible total) never mismatches', () => {
  assert.equal(isSumMismatched(100, null), false);
  assert.equal(isSumMismatched(0, null), false);
});

test('receiptSchema: accepts a well-formed response with a null category', () => {
  const parsed = receiptSchema.parse({
    store: 'Mega Mall',
    total: 24.12,
    items: [{ name: 'Хлеб', amount: 1.2, category: null }],
  });
  assert.equal(parsed.items.length, 1);
});

test('receiptSchema: accepts the empty-receipt shape ("not a receipt" case)', () => {
  const parsed = receiptSchema.parse({ store: null, total: null, items: [] });
  assert.deepEqual(parsed.items, []);
});

test('receiptSchema: rejects a zero or negative item amount', () => {
  assert.throws(() =>
    receiptSchema.parse({ store: null, total: null, items: [{ name: 'X', amount: 0, category: null }] }),
  );
  assert.throws(() =>
    receiptSchema.parse({ store: null, total: null, items: [{ name: 'X', amount: -5, category: null }] }),
  );
});

test('receiptSchema: rejects a missing required field', () => {
  assert.throws(() => receiptSchema.parse({ store: null, items: [] }));
});
