import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previousMonthKey,
  nextMonthKey,
  monthKeyToString,
  endingBalance,
  monthDateRangeISO,
  resolveRolloverStartingBalance,
  cascadeStartingBalance,
  type MonthRecord,
} from './monthly-balance-logic.js';

test('previousMonthKey: steps back a month within the same year', () => {
  assert.deepEqual(previousMonthKey({ year: 2026, month: 11 }), { year: 2026, month: 10 });
});

test('previousMonthKey: January rolls back into December of the prior year', () => {
  assert.deepEqual(previousMonthKey({ year: 2026, month: 1 }), { year: 2025, month: 12 });
});

test('nextMonthKey: December rolls forward into January of the next year', () => {
  assert.deepEqual(nextMonthKey({ year: 2026, month: 12 }), { year: 2027, month: 1 });
});

test('monthKeyToString: zero-pads single-digit months', () => {
  assert.equal(monthKeyToString({ year: 2026, month: 3 }), '2026-03');
});

test('endingBalance: income adds, expenses (including investments) subtract', () => {
  assert.equal(endingBalance(1000, 500, 300), 1200);
});

test('endingBalance: can go negative', () => {
  assert.equal(endingBalance(100, 0, 500), -400);
});

test('monthDateRangeISO: covers exactly one calendar month in UTC', () => {
  assert.deepEqual(monthDateRangeISO(2026, 11), {
    start: '2026-11-01T00:00:00.000Z',
    end: '2026-12-01T00:00:00.000Z',
  });
});

test('monthDateRangeISO: December rolls the end boundary into the next year', () => {
  assert.deepEqual(monthDateRangeISO(2026, 12), {
    start: '2026-12-01T00:00:00.000Z',
    end: '2027-01-01T00:00:00.000Z',
  });
});

test('resolveRolloverStartingBalance: no previous month defaults to 0 and stays unconfirmed', () => {
  assert.deepEqual(resolveRolloverStartingBalance(null), { startingBalance: 0, isConfirmed: false });
});

test("resolveRolloverStartingBalance: carries over a confirmed previous month's ending balance, still confirmed", () => {
  const result = resolveRolloverStartingBalance({ startingBalance: 1000, income: 500, expenses: 300, isConfirmed: true });
  assert.deepEqual(result, { startingBalance: 1200, isConfirmed: true });
});

test('resolveRolloverStartingBalance: a negative ending balance carries over as-is', () => {
  const result = resolveRolloverStartingBalance({ startingBalance: 100, income: 0, expenses: 500, isConfirmed: true });
  assert.deepEqual(result, { startingBalance: -400, isConfirmed: true });
});

test('resolveRolloverStartingBalance: rolling over an unconfirmed previous month stays unconfirmed', () => {
  const result = resolveRolloverStartingBalance({ startingBalance: 0, income: 500, expenses: 300, isConfirmed: false });
  assert.deepEqual(result, { startingBalance: 200, isConfirmed: false });
});

test('cascadeStartingBalance: edits a month that has no later months, nothing else to shift', () => {
  const records = new Map<string, MonthRecord>([
    ['2026-11', { startingBalance: 0, income: 500, expenses: 300, isConfirmed: false }],
  ]);
  const result = cascadeStartingBalance(records, { year: 2026, month: 11 }, 1000, true);
  assert.deepEqual(result.get('2026-11'), { startingBalance: 1000, income: 500, expenses: 300, isConfirmed: true });
});

test('cascadeStartingBalance: propagates through every already-materialized later month', () => {
  const records = new Map<string, MonthRecord>([
    ['2026-10', { startingBalance: 0, income: 1000, expenses: 400, isConfirmed: false }],
    ['2026-11', { startingBalance: 600, income: 500, expenses: 300, isConfirmed: false }],
    ['2026-12', { startingBalance: 800, income: 200, expenses: 900, isConfirmed: false }],
  ]);

  const result = cascadeStartingBalance(records, { year: 2026, month: 10 }, 200, true);

  // October: 200 -400 +1000 = 800 (was 600, was computed from 0 -400 +1000)
  assert.deepEqual(result.get('2026-10'), { startingBalance: 200, income: 1000, expenses: 400, isConfirmed: true });
  // November's starting balance becomes October's new ending balance.
  assert.deepEqual(result.get('2026-11'), { startingBalance: 800, income: 500, expenses: 300, isConfirmed: true });
  // December's starting balance becomes November's new ending balance (800 -300 +500 = 1000).
  assert.deepEqual(result.get('2026-12'), { startingBalance: 1000, income: 200, expenses: 900, isConfirmed: true });
});

test('cascadeStartingBalance: stops at the first month with no stored record', () => {
  const records = new Map<string, MonthRecord>([
    ['2026-10', { startingBalance: 0, income: 1000, expenses: 400, isConfirmed: false }],
    // 2026-11 was never materialized.
    ['2026-12', { startingBalance: 800, income: 200, expenses: 900, isConfirmed: false }],
  ]);

  const result = cascadeStartingBalance(records, { year: 2026, month: 10 }, 200, true);

  assert.deepEqual(result.get('2026-10'), { startingBalance: 200, income: 1000, expenses: 400, isConfirmed: true });
  // December is untouched -- the gap at November breaks the chain.
  assert.deepEqual(result.get('2026-12'), { startingBalance: 800, income: 200, expenses: 900, isConfirmed: false });
});

test('cascadeStartingBalance: a cascaded balance can go negative', () => {
  const records = new Map<string, MonthRecord>([
    ['2026-10', { startingBalance: 500, income: 0, expenses: 0, isConfirmed: true }],
    ['2026-11', { startingBalance: 500, income: 0, expenses: 1000, isConfirmed: true }],
  ]);

  const result = cascadeStartingBalance(records, { year: 2026, month: 10 }, -200, true);

  assert.deepEqual(result.get('2026-10'), { startingBalance: -200, income: 0, expenses: 0, isConfirmed: true });
  assert.deepEqual(result.get('2026-11'), { startingBalance: -200, income: 0, expenses: 1000, isConfirmed: true });
});

test('cascadeStartingBalance: a reset can land back on an unconfirmed value and still propagates it', () => {
  const records = new Map<string, MonthRecord>([
    ['2026-10', { startingBalance: 1000, income: 0, expenses: 0, isConfirmed: true }],
    ['2026-11', { startingBalance: 1000, income: 500, expenses: 300, isConfirmed: true }],
  ]);

  // Resetting October back to its "no prior history" default lands on an
  // unconfirmed 0, not a manual edit's confirmed value.
  const result = cascadeStartingBalance(records, { year: 2026, month: 10 }, 0, false);

  assert.deepEqual(result.get('2026-10'), { startingBalance: 0, income: 0, expenses: 0, isConfirmed: false });
  assert.deepEqual(result.get('2026-11'), { startingBalance: 0, income: 500, expenses: 300, isConfirmed: false });
});
