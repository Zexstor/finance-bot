import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAutoInvestment } from './auto-investment-logic.js';

test('calculateAutoInvestment: 10% of a round income amount', () => {
  assert.equal(calculateAutoInvestment(500), 50);
});

test('calculateAutoInvestment: rounds to the nearest cent', () => {
  assert.equal(calculateAutoInvestment(1234.56), 123.46);
});

test('calculateAutoInvestment: zero income gives zero', () => {
  assert.equal(calculateAutoInvestment(0), 0);
});

test('calculateAutoInvestment: a tiny income rounds down to zero, not a dust transaction', () => {
  assert.equal(calculateAutoInvestment(0.01), 0);
});
