// Pure scheduling math, kept separate from the actual job runner so it can be
// unit-tested without real timers or network/DB access.

export function msUntilNextSunday(hour: number, now: Date): number {
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilSunday = (7 - day) % 7;

  const target = new Date(now);
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(hour, 0, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 7);
  }

  return target.getTime() - now.getTime();
}
