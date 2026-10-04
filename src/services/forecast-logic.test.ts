import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlyForecast, usesRunRateForecast } from './forecast-logic.js';

test('calculateMonthlyForecast: projects a 30-day run rate from the daily average', () => {
  assert.equal(calculateMonthlyForecast(100, 10), 300);
});

test('calculateMonthlyForecast: zero spent gives a zero forecast', () => {
  assert.equal(calculateMonthlyForecast(0, 10), 0);
});

test('calculateMonthlyForecast: day one of the month (daysElapsed=1) just scales by 30', () => {
  assert.equal(calculateMonthlyForecast(10, 1), 300);
});

test('calculateMonthlyForecast: daysElapsed=0 is clamped to 1, not a division by zero', () => {
  assert.equal(calculateMonthlyForecast(10, 0), 300);
  assert.ok(Number.isFinite(calculateMonthlyForecast(10, 0)));
});

test('calculateMonthlyForecast: full month elapsed (30 days) returns the actual total unchanged', () => {
  assert.equal(calculateMonthlyForecast(450, 30), 450);
});

test('usesRunRateForecast: everyday spending categories use a run-rate projection', () => {
  for (const name of ['Продукты и БХ', 'Кафе и рестораны', 'Красота и гигиена', 'Транспорт', 'Бытовая химия', 'Другое']) {
    assert.equal(usesRunRateForecast(name), true, name);
  }
});

test('usesRunRateForecast: fixed/recurring-style categories do not use a run-rate projection', () => {
  for (const name of ['Для ребёнка', 'Аптека и здоровье', 'Связь и интернет', 'Для дома', 'Одежда', 'Подарки', 'Инвестиции']) {
    assert.equal(usesRunRateForecast(name), false, name);
  }
});

test('usesRunRateForecast: an unknown/custom category name defaults to false (falls back to the plan lookup)', () => {
  assert.equal(usesRunRateForecast('Совершенно новая категория'), false);
});
