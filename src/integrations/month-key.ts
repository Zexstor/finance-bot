// Maps a point in time to the "YYYY-MM" bucket a transaction belongs to.
// Each month has its own Google Sheet (see monthly-sheets), so routing a
// transaction to the right spreadsheet comes down to this key.
//
// The bucket is computed in the app's own time zone, not UTC: a transaction
// logged at 00:30 on Nov 1 local time must land in November even though it is
// still October in UTC. The Docker image pins TZ=Europe/Podgorica; we read it
// from the environment so local runs and tests can override it explicitly.
export const APP_TIME_ZONE = process.env.TZ || 'Europe/Podgorica';

export function monthKey(date: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;

  if (!year || !month) {
    throw new Error(`Could not derive month key for date ${date.toISOString()} in zone ${timeZone}`);
  }

  return `${year}-${month}`;
}

export function currentMonthKey(timeZone: string = APP_TIME_ZONE): string {
  return monthKey(new Date(), timeZone);
}
