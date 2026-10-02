import { test } from 'node:test';
import assert from 'node:assert/strict';
import { msUntilNextSunday } from './weekly-report-schedule.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('from Monday noon, target is Sunday of the same week', () => {
  const monday = new Date(2026, 9, 5, 12, 0, 0); // Oct 5 2026 is a Monday
  const delay = msUntilNextSunday(10, monday);
  const expected = 6 * DAY - 2 * HOUR; // Sunday 10:00, 6 days + 2h earlier than Monday 12:00... see below
  // Monday 12:00 -> Sunday 10:00 is 6 days minus 2 hours
  assert.equal(delay, expected);
});

test('from Sunday before the target hour, fires later the same day', () => {
  const sundayMorning = new Date(2026, 9, 4, 8, 0, 0); // Oct 4 2026 is a Sunday
  const delay = msUntilNextSunday(10, sundayMorning);
  assert.equal(delay, 2 * HOUR);
});

test('from Sunday exactly at the target hour, rolls over to next week (not 0)', () => {
  const sundayAtTarget = new Date(2026, 9, 4, 10, 0, 0);
  const delay = msUntilNextSunday(10, sundayAtTarget);
  assert.equal(delay, 7 * DAY);
});

test('from Sunday after the target hour, rolls over to next week', () => {
  const sundayEvening = new Date(2026, 9, 4, 18, 0, 0);
  const delay = msUntilNextSunday(10, sundayEvening);
  assert.equal(delay, 7 * DAY - 8 * HOUR);
});

test('from Saturday, target is the very next day', () => {
  const saturday = new Date(2026, 9, 3, 9, 0, 0); // Oct 3 2026 is a Saturday
  const delay = msUntilNextSunday(10, saturday);
  assert.equal(delay, DAY + HOUR);
});

test('result always lands on a Sunday at the configured hour', () => {
  const now = new Date(2026, 9, 7, 23, 59, 0); // Wednesday
  const delay = msUntilNextSunday(10, now);
  const target = new Date(now.getTime() + delay);
  assert.equal(target.getDay(), 0);
  assert.equal(target.getHours(), 10);
  assert.equal(target.getMinutes(), 0);
});
