import { supabase } from '../db/client.js';
import { getStoredStartingBalance, upsertStartingBalance } from '../db/monthly-balances.js';
import {
  type MonthKey,
  previousMonthKey,
  nextMonthKey,
  endingBalance,
  resolveRolloverStartingBalance,
  monthDateRangeISO,
} from './monthly-balance-logic.js';

export interface MonthlyTotals {
  income: number;
  expenses: number;
}

export async function getMonthlyTotals(year: number, month: number): Promise<MonthlyTotals> {
  const { start, end } = monthDateRangeISO(year, month);

  const [incomeResult, expenseResult] = await Promise.all([
    supabase.from('transactions').select('amount').eq('type', 'income').gte('created_at', start).lt('created_at', end),
    supabase.from('transactions').select('amount').eq('type', 'expense').gte('created_at', start).lt('created_at', end),
  ]);

  if (incomeResult.error) {
    throw incomeResult.error;
  }
  if (expenseResult.error) {
    throw expenseResult.error;
  }

  const income = (incomeResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = (expenseResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  return { income, expenses };
}

export interface BalanceSummary {
  year: number;
  month: number;
  startingBalance: number;
  income: number;
  expenses: number;
  endingBalance: number;
  needsPrompt: boolean;
}

// Resolves this month's starting balance, materializing (and persisting) it
// from the previous month's ending balance if it hasn't been touched yet --
// this lazy resolution on first read is what makes the "1st of the month"
// carry-over happen, since there's no separate cron job for it.
export async function getBalanceSummary(year: number, month: number): Promise<BalanceSummary> {
  let startingBalance = await getStoredStartingBalance(year, month);
  let needsPrompt = false;

  if (startingBalance === null) {
    const prev = previousMonthKey({ year, month });
    const prevStored = await getStoredStartingBalance(prev.year, prev.month);

    if (prevStored === null) {
      const rollover = resolveRolloverStartingBalance(null);
      startingBalance = rollover.startingBalance;
      needsPrompt = rollover.needsPrompt;
    } else {
      const prevTotals = await getMonthlyTotals(prev.year, prev.month);
      const rollover = resolveRolloverStartingBalance({ startingBalance: prevStored, ...prevTotals });
      startingBalance = rollover.startingBalance;
      needsPrompt = rollover.needsPrompt;
    }

    await upsertStartingBalance(year, month, startingBalance, null);
  }

  const totals = await getMonthlyTotals(year, month);

  return {
    year,
    month,
    startingBalance,
    income: totals.income,
    expenses: totals.expenses,
    endingBalance: endingBalance(startingBalance, totals.income, totals.expenses),
    needsPrompt,
  };
}

// Manually setting a month's starting balance cascades forward through
// every later month that's already been materialized (see
// cascadeStartingBalance's doc comment for why it stops at the first gap).
export async function setStartingBalance(year: number, month: number, amount: number, updatedBy: number): Promise<void> {
  await upsertStartingBalance(year, month, amount, updatedBy);

  let current: MonthKey = { year, month };
  let currentBalance = amount;

  while (true) {
    const totals = await getMonthlyTotals(current.year, current.month);
    const ending = endingBalance(currentBalance, totals.income, totals.expenses);
    const next = nextMonthKey(current);
    const nextStored = await getStoredStartingBalance(next.year, next.month);

    if (nextStored === null) {
      break;
    }

    await upsertStartingBalance(next.year, next.month, ending, updatedBy);
    current = next;
    currentBalance = ending;
  }
}
