// Pure math for the "skim a fixed share of every income into Инвестиции
// automatically" rule, kept separate from the DB/Sheets-writing code in
// bot.ts so the rate and rounding are unit-tested without a database.

export const AUTO_INVEST_RATE = 0.1;
export const AUTO_INVEST_CATEGORY_NAME = 'Инвестиции';
export const AUTO_INVEST_NOTE = 'Авто-инвестиции (10% от дохода)';

export function calculateAutoInvestment(incomeAmount: number): number {
  return Math.round(incomeAmount * AUTO_INVEST_RATE * 100) / 100;
}
