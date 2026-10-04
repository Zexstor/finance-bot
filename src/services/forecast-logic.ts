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

// Some categories spend roughly evenly across the month (groceries, cafes,
// transport) -- a run-rate projection is a reasonable estimate for those.
// Others are closer to a fixed monthly line item (rent-like: gifts,
// investments, subscriptions) where a run-rate would be misleading early in
// the month -- for those the user wants to see the fixed planned budget they
// already keep in the Google Sheets template instead. Decided explicitly
// per category name (from the user's own instructions), not inferred.
const RUN_RATE_FORECAST_CATEGORIES = new Set([
  'Продукты и БХ',
  'Кафе и рестораны',
  'Красота и гигиена',
  'Транспорт',
  'Бытовая химия',
  'Другое',
]);

export function usesRunRateForecast(categoryName: string): boolean {
  return RUN_RATE_FORECAST_CATEGORIES.has(categoryName);
}
