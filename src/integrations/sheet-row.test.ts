import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsFor, toSheetsSerial, buildTemplateRowValues, EXPENSE_COLUMNS, INCOME_COLUMNS } from './sheet-row.js';

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
