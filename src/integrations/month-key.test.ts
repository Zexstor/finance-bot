import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthKey } from './month-key.js';

test('monthKey formats year and month with a leading zero', () => {
  assert.equal(monthKey(new Date('2026-11-02T12:00:00Z'), 'UTC'), '2026-11');
  assert.equal(monthKey(new Date('2026-01-15T12:00:00Z'), 'UTC'), '2026-01');
});

test('monthKey uses the given time zone, not UTC, at a month boundary', () => {
  // 23:30 UTC on Oct 31 is already 00:30 Nov 1 in Podgorica (UTC+1 in winter).
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z'), 'Europe/Podgorica'), '2026-11');
  // 00:30 UTC on Nov 1 is still Nov 1 locally -> November.
  assert.equal(monthKey(new Date('2026-11-01T00:30:00Z'), 'Europe/Podgorica'), '2026-11');
});

test('monthKey rolls back across the boundary for the same instant in UTC', () => {
  // The same instant that is November in Podgorica is still October in UTC.
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z'), 'UTC'), '2026-10');
});
