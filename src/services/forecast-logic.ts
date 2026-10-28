// Pure forecasting math, kept separate from the Supabase-querying report
// service so it's unit-tested without a database.

// Projects a category's (or the total) month-end spend from how much has
// been spent so far, assuming the daily rate stays constant: spent-per-day
// so far, times a 30-day month. `daysElapsed` is clamped to at least 1 so
// day one of the month (or a 0 passed in by mistake) never divides by zero.
export function calculateMonthlyForecast(spentSoFar: number, daysElapsed: number): number {
  const safeDays = Math.max(daysElapsed, 1);
  return (spentSoFar / safeDays) * 30;
}
