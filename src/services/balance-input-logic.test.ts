import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStartingBalanceInput } from './balance-input-logic.js';

test('parseStartingBalanceInput: a plain integer', () => {
  assert.deepEqual(parseStartingBalanceInput('614650'), { ok: true, amount: 614650 });
});

test('parseStartingBalanceInput: spaces as thousands separators', () => {
  assert.deepEqual(parseStartingBalanceInput('614 650'), { ok: true, amount: 614650 });
});

test('parseStartingBalanceInput: a comma decimal separator', () => {
  assert.deepEqual(parseStartingBalanceInput('614650,50'), { ok: true, amount: 614650.5 });
});

test('parseStartingBalanceInput: spaces and a comma together', () => {
  assert.deepEqual(parseStartingBalanceInput('614 650,50'), { ok: true, amount: 614650.5 });
});

test('parseStartingBalanceInput: negative values are allowed', () => {
  assert.deepEqual(parseStartingBalanceInput('-500'), { ok: true, amount: -500 });
});

test('parseStartingBalanceInput: zero is allowed', () => {
  assert.deepEqual(parseStartingBalanceInput('0'), { ok: true, amount: 0 });
});

test('parseStartingBalanceInput: non-numeric text is rejected', () => {
  assert.deepEqual(parseStartingBalanceInput('много'), { ok: false });
});

test('parseStartingBalanceInput: empty input is rejected', () => {
  assert.deepEqual(parseStartingBalanceInput('   '), { ok: false });
});
