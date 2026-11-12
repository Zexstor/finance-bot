import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentIntentSchema, formatRecentTransactionsForPrompt } from './agent-intent-logic.js';

test('agentIntentSchema: accepts a well-formed edit intent', () => {
  const parsed = agentIntentSchema.parse({
    intent: 'edit',
    transactionId: 42,
    editField: 'category',
    editValue: 'Транспорт',
    queryCategory: null,
    queryPeriod: null,
  });
  assert.equal(parsed.transactionId, 42);
});

test('agentIntentSchema: accepts the unclear shape with all nulls', () => {
  const parsed = agentIntentSchema.parse({
    intent: 'unclear',
    transactionId: null,
    editField: null,
    editValue: null,
    queryCategory: null,
    queryPeriod: null,
  });
  assert.equal(parsed.intent, 'unclear');
});

test('agentIntentSchema: rejects an invalid intent value', () => {
  assert.throws(() =>
    agentIntentSchema.parse({
      intent: 'chat',
      transactionId: null,
      editField: null,
      editValue: null,
      queryCategory: null,
      queryPeriod: null,
    }),
  );
});

test('agentIntentSchema: rejects a missing required field', () => {
  assert.throws(() => agentIntentSchema.parse({ intent: 'query', transactionId: null }));
});

test('formatRecentTransactionsForPrompt: empty list gives a placeholder, not an empty string', () => {
  assert.equal(formatRecentTransactionsForPrompt([]), '(нет недавних операций)');
});

test('formatRecentTransactionsForPrompt: includes id, amount and category for each row', () => {
  const text = formatRecentTransactionsForPrompt([
    {
      id: 7,
      type: 'expense',
      amount: 3.5,
      categoryName: 'Кафе и рестораны',
      description: 'кофе',
      created_at: '2026-10-02T09:00:00.000Z',
    },
  ]);
  assert.match(text, /id=7/);
  assert.match(text, /3\.50/);
  assert.match(text, /Кафе и рестораны/);
  assert.match(text, /кофе/);
});

test('formatRecentTransactionsForPrompt: missing category/note fall back to readable placeholders', () => {
  const text = formatRecentTransactionsForPrompt([
    { id: 1, type: 'income', amount: 500, categoryName: null, description: null, created_at: '2026-10-01T00:00:00.000Z' },
  ]);
  assert.match(text, /без категории/);
  assert.match(text, /без заметки/);
});

test('formatRecentTransactionsForPrompt: tags the auto-investment row as not "the last" entry', () => {
  const text = formatRecentTransactionsForPrompt([
    {
      id: 2,
      type: 'expense',
      amount: 35,
      categoryName: 'Инвестиции',
      description: 'Авто-инвестиции (10% от дохода)',
      created_at: '2026-11-11T13:23:22.000Z',
    },
    {
      id: 1,
      type: 'income',
      amount: 350,
      categoryName: 'Подработки',
      description: 'паша',
      created_at: '2026-11-11T13:23:22.000Z',
    },
  ]);
  const [autoLine, incomeLine] = text.split('\n');
  assert.match(autoLine, /СИСТЕМНАЯ/);
  assert.doesNotMatch(incomeLine, /СИСТЕМНАЯ/);
});
