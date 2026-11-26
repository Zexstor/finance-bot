import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  columnsFor,
  toSheetsSerial,
  buildTemplateRowValues,
  locateRemovedRow,
  findAppendRow,
  EXPENSE_COLUMNS,
  INCOME_COLUMNS,
} from './sheet-row.js';

test('columnsFor: expense uses the left-hand block', () => {
  assert.deepEqual(columnsFor('expense'), EXPENSE_COLUMNS);
});

test('columnsFor: income uses the right-hand block', () => {
  assert.deepEqual(columnsFor('income'), INCOME_COLUMNS);
});

test('expense and income blocks never overlap in columns', () => {
  const expenseCols = Object.values(EXPENSE_COLUMNS);
  const incomeCols = Object.values(INCOME_COLUMNS);
  for (const c of expenseCols) {
    assert.ok(!incomeCols.includes(c), `column ${c} used by both blocks`);
  }
});

test('toSheetsSerial: matches a known Google Sheets date serial', () => {
  // Verified empirically against the user's real template: 01.10.2026 -> 46296
  assert.equal(toSheetsSerial(new Date(Date.UTC(2026, 9, 1))), 46296);
});

test('toSheetsSerial: one calendar day apart is exactly 1 apart', () => {
  const a = toSheetsSerial(new Date(Date.UTC(2026, 9, 1)));
  const b = toSheetsSerial(new Date(Date.UTC(2026, 9, 2)));
  assert.equal(b - a, 1);
});

test('toSheetsSerial: uses the LOCAL calendar day at a midnight boundary', () => {
  // 23:47 UTC on Oct 31 is 00:47 Nov 1 in Podgorica -> should serialize to
  // Nov 1 (46327), matching the month it is filed under, not Oct 31.
  const instant = new Date('2026-10-31T23:47:46Z');
  assert.equal(toSheetsSerial(instant, 'Europe/Podgorica'), 46327);
  assert.equal(toSheetsSerial(instant, 'UTC'), 46326);
});

test('buildTemplateRowValues: missing category falls back to "Без категории"', () => {
  const values = buildTemplateRowValues({ type: 'expense', amount: 3.5, categoryName: null, note: 'кофе' });
  assert.equal(values.category, 'Без категории');
});

test('buildTemplateRowValues: empty/missing note becomes an empty string', () => {
  const values = buildTemplateRowValues({ type: 'expense', amount: 3.5, categoryName: 'Кафе', note: null });
  assert.equal(values.description, '');
});

test('buildTemplateRowValues: passes amount and category through unchanged', () => {
  const values = buildTemplateRowValues({ type: 'income', amount: 1500, categoryName: 'Зарплата', note: 'зарплата' });
  assert.equal(values.amount, 1500);
  assert.equal(values.category, 'Зарплата');
  assert.equal(values.description, 'зарплата');
});

test('locateRemovedRow: undone row is looked up in its own month and block', () => {
  assert.deepEqual(
    locateRemovedRow({ type: 'expense', amount: 6, description: 'Мега продукты', createdAt: '2026-11-20T20:07:00Z' }),
    { month: '2026-11', type: 'expense', amount: 6, description: 'Мега продукты' },
  );
});

test('locateRemovedRow: just after local midnight belongs to the new month', () => {
  // 23:30 UTC on Oct 31 is 00:30 on Nov 1 in Podgorica.
  assert.equal(locateRemovedRow({ type: 'expense', amount: 1, description: 'x', createdAt: '2026-10-31T23:30:00Z' }).month, '2026-11');
});

test('locateRemovedRow: a missing note matches an empty description cell', () => {
  assert.equal(locateRemovedRow({ type: 'income', amount: 50, description: null, createdAt: '2026-11-17T14:09:00Z' }).description, '');
});

test('findAppendRow: empty block starts at the first data row', () => {
  assert.equal(findAppendRow(() => false, 4, 999), 4);
});

test('findAppendRow: goes after the last used row, not into a gap', () => {
  const used = new Set([4, 5, 7, 8]); // row 6 is a gap left by a delete
  assert.equal(findAppendRow((r) => used.has(r), 4, 999), 9);
});

test('findAppendRow: a batch never lands on top of used rows', () => {
  const used = new Set([4, 6]); // a one-row gap at 5
  assert.equal(findAppendRow((r) => used.has(r), 4, 999, 3), 7);
});

test('findAppendRow: returns null when the batch does not fit', () => {
  assert.equal(findAppendRow((r) => r === 997, 4, 999, 2), null);
  assert.equal(findAppendRow((r) => r === 997, 4, 999, 1), 998);
});
