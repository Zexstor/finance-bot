// Pure parsing for the "type a number to set this category's monthly goal"
// text reply, kept separate so it's unit-tested without touching the bot
// or the DB. "0" (or anything that rounds down to it) means "clear the
// goal", not "target zero spending" -- mirrors how a blank/0 planned amount
// in the old Google Sheets template meant "no plan set".

export type ParsedCategoryGoal = { ok: true; goal: number | null } | { ok: false };

export function parseCategoryGoalInput(text: string): ParsedCategoryGoal {
  const value = Number(text.trim().replace(',', '.'));

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false };
  }

  return { ok: true, goal: value > 0 ? value : null };
}
