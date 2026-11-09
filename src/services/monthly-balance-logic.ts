// Pure logic for the "начальная сумма на начало месяца" feature, kept free
// of Supabase calls so month rollover, cascading edits, and negative
// balances are unit-tested without a database.

export interface MonthKey {
  year: number;
  month: number; // 1-12
}

export function previousMonthKey({ year, month }: MonthKey): MonthKey {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonthKey({ year, month }: MonthKey): MonthKey {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function monthKeyToString({ year, month }: MonthKey): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Expenses (including "Инвестиции", which is just another expense category)
// are subtracted from the starting balance, income is added -- same rule as
// the family's old spreadsheet.
export function endingBalance(startingBalance: number, income: number, expenses: number): number {
  return startingBalance - expenses + income;
}

// UTC month boundaries for an arbitrary (year, month), independent of "now"
// so it's usable for both the current month and rollover/cascade lookups
// into past months.
export function monthDateRangeISO(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface RolloverResult {
  startingBalance: number;
  needsPrompt: boolean;
}

// What a brand-new month's starting balance should be, given the previous
// month's stored record (or null if the previous month was never set up at
// all). A negative previous ending balance carries over as-is.
export function resolveRolloverStartingBalance(
  previousMonth: { startingBalance: number; income: number; expenses: number } | null,
): RolloverResult {
  if (!previousMonth) {
    return { startingBalance: 0, needsPrompt: true };
  }

  return {
    startingBalance: endingBalance(previousMonth.startingBalance, previousMonth.income, previousMonth.expenses),
    needsPrompt: false,
  };
}

export interface MonthRecord {
  startingBalance: number;
  income: number;
  expenses: number;
}

// When a user manually edits a past month's starting balance, every
// already-materialized later month must shift by the same amount, in order:
// month N+1's starting balance is month N's new ending balance, and so on.
// Stops at the first month that doesn't have a record yet -- there's
// nothing to cascade into, and we don't want to invent future months here.
export function cascadeStartingBalance(
  records: ReadonlyMap<string, MonthRecord>,
  editedMonth: MonthKey,
  newStartingBalance: number,
): Map<string, MonthRecord> {
  const result = new Map(records);

  let current = editedMonth;
  let currentBalance = newStartingBalance;

  while (true) {
    const key = monthKeyToString(current);
    const existing = result.get(key);
    if (!existing) {
      break;
    }

    result.set(key, { ...existing, startingBalance: currentBalance });

    const ending = endingBalance(currentBalance, existing.income, existing.expenses);
    const next = nextMonthKey(current);
    const nextKey = monthKeyToString(next);
    if (!result.has(nextKey)) {
      break;
    }

    current = next;
    currentBalance = ending;
  }

  return result;
}
