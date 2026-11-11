import { supabase } from '../db/client.js';
import { getStoredStartingBalance, upsertStartingBalance, deleteStoredStartingBalance } from '../db/monthly-balances.js';
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
//
// needsPrompt is read from the stored is_confirmed flag every call, not
// just computed once at materialization time -- otherwise the first ever
// read of a new month (even an automated one, like a health check) would
// permanently silence the "please set your starting balance" nudge before
// any person had actually seen or confirmed it.
export async function getBalanceSummary(year: number, month: number): Promise<BalanceSummary> {
  let stored = await getStoredStartingBalance(year, month);

  if (stored === null) {
    const prev = previousMonthKey({ year, month });
    const prevStored = await getStoredStartingBalance(prev.year, prev.month);

    let rollover;
    if (prevStored === null) {
      rollover = resolveRolloverStartingBalance(null);
    } else {
      const prevTotals = await getMonthlyTotals(prev.year, prev.month);
      rollover = resolveRolloverStartingBalance({ startingBalance: prevStored.startingBalance, ...prevTotals, isConfirmed: prevStored.isConfirmed });
    }

    await upsertStartingBalance(year, month, rollover.startingBalance, rollover.isConfirmed, null);
    stored = { startingBalance: rollover.startingBalance, isConfirmed: rollover.isConfirmed };
  }

  const totals = await getMonthlyTotals(year, month);

  return {
    year,
    month,
    startingBalance: stored.startingBalance,
    income: totals.income,
    expenses: totals.expenses,
    endingBalance: endingBalance(stored.startingBalance, totals.income, totals.expenses),
    needsPrompt: !stored.isConfirmed,
  };
}

// Walks forward from `from`, shifting every already-materialized later
// month's starting balance to match, stamping each one with isConfirmed
// (see cascadeStartingBalance's doc comment -- this mirrors that pure
// algorithm against the DB). Stops at the first month with no stored row.
async function cascadeForward(from: MonthKey, startingBalance: number, isConfirmed: boolean, updatedBy: number | null): Promise<void> {
  let current = from;
  let currentBalance = startingBalance;

  while (true) {
    const totals = await getMonthlyTotals(current.year, current.month);
    const ending = endingBalance(currentBalance, totals.income, totals.expenses);
    const next = nextMonthKey(current);
    const nextStored = await getStoredStartingBalance(next.year, next.month);

    if (nextStored === null) {
      break;
    }

    await upsertStartingBalance(next.year, next.month, ending, isConfirmed, updatedBy);
    current = next;
    currentBalance = ending;
  }
}

// Manually setting a month's starting balance cascades forward through
// every later month that's already been materialized. Every month touched
// by the cascade becomes confirmed, including the edited one -- they're
// now derived from a real number instead of a blind 0 guess. This never
// touches the transactions table (no income/expense row, no auto-invest):
// it's purely the carried-over opening number, not a real transaction.
export async function setStartingBalance(year: number, month: number, amount: number, updatedBy: number): Promise<void> {
  await upsertStartingBalance(year, month, amount, true, updatedBy);
  await cascadeForward({ year, month }, amount, true, updatedBy);
}

// Deletes a month's stored override and lets it fall back to its natural
// rollover value (see getBalanceSummary), then cascades that recomputed
// value -- and whatever isConfirmed it actually came out to -- forward
// through later months, same as a manual edit would.
export async function resetStartingBalance(year: number, month: number, updatedBy: number): Promise<void> {
  await deleteStoredStartingBalance(year, month);
  const summary = await getBalanceSummary(year, month);
  await cascadeForward({ year, month }, summary.startingBalance, !summary.needsPrompt, updatedBy);
}
