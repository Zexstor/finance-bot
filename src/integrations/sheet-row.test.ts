import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSheetRow } from './sheet-row.js';

const BASE = {
  type: 'expense' as const,
  amount: 3.5,
  categoryName: 'Кафе и рестораны',
  note: 'кофе',
  authorName: 'Pavel',
  source: 'text' as const,
  createdAt: '2026-10-05T09:00:00.000Z',
};

test('formatSheetRow: expense maps to Russian labels', () => {
  const row = formatSheetRow(BASE);
  assert.equal(row.Type, 'Расход');
  assert.equal(row.Amount, 3.5);
  assert.equal(row.Category, 'Кафе и рестораны');
  assert.equal(row.Note, 'кофе');
  assert.equal(row.Author, 'Pavel');
  assert.equal(row.Source, 'текст');
});

test('formatSheetRow: income maps to "Доход"', () => {
  const row = formatSheetRow({ ...BASE, type: 'income' });
  assert.equal(row.Type, 'Доход');
});

test('formatSheetRow: missing category falls back to "Без категории"', () => {
  const row = formatSheetRow({ ...BASE, categoryName: null });
  assert.equal(row.Category, 'Без категории');
});

test('formatSheetRow: empty note becomes an empty string, not null/undefined', () => {
  const row = formatSheetRow({ ...BASE, note: '' });
  assert.equal(row.Note, '');
  assert.notEqual(row.Note, null);
});

test('formatSheetRow: voice and photo sources get Russian labels', () => {
  assert.equal(formatSheetRow({ ...BASE, source: 'voice' }).Source, 'голос');
  assert.equal(formatSheetRow({ ...BASE, source: 'photo' }).Source, 'фото чека');
});
