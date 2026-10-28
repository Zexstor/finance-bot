import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategoryGoalInput } from './category-goal-logic.js';

test('parseCategoryGoalInput: a positive number sets that goal', () => {
  assert.deepEqual(parseCategoryGoalInput('300'), { ok: true, goal: 300 });
});

test('parseCategoryGoalInput: accepts a comma decimal separator', () => {
  assert.deepEqual(parseCategoryGoalInput('150,50'), { ok: true, goal: 150.5 });
});

test('parseCategoryGoalInput: "0" clears the goal (null), not a zero target', () => {
  assert.deepEqual(parseCategoryGoalInput('0'), { ok: true, goal: null });
});

test('parseCategoryGoalInput: surrounding whitespace is ignored', () => {
  assert.deepEqual(parseCategoryGoalInput('  200  '), { ok: true, goal: 200 });
});

test('parseCategoryGoalInput: a negative number is rejected', () => {
  assert.deepEqual(parseCategoryGoalInput('-5'), { ok: false });
});

test('parseCategoryGoalInput: non-numeric text is rejected', () => {
  assert.deepEqual(parseCategoryGoalInput('много'), { ok: false });
});
