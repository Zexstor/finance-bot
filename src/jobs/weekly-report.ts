import { bot } from '../bot/bot.js';
import { env } from '../config/env.js';
import { getWeeklyReport, getMonthlyReport } from '../services/report.js';
import { truncateForTelegram, formatForecastLines } from '../bot/format.js';
import { msUntilNextSunday } from './weekly-report-schedule.js';

// Process-local time. The Docker image sets TZ=Europe/Podgorica, so this is
// 10:00 Montenegro time regardless of the host VPS's own timezone.
const SEND_HOUR = 10;

async function sendWeeklyReport(): Promise<void> {
  let report;
  try {
    report = await getWeeklyReport();
  } catch (error) {
    console.error('Failed to build weekly report:', error);
    return;
  }

  const lines = ['🗓 Еженедельный отчёт', ''];
  lines.push(`Доход за неделю: ${report.income.toFixed(2)} €`);
  lines.push(`Расход за неделю: ${report.totalExpenses.toFixed(2)} €`);
  const balanceLabel = report.balance >= 0 ? 'Остаток' : 'Перерасход';
  lines.push(`${balanceLabel}: ${report.balance.toFixed(2)} €`);

  if (report.expensesByCategory.length > 0) {
    lines.push('', 'Расходы по категориям:');
    for (const category of report.expensesByCategory) {
      lines.push(`➖ ${category.name}: ${category.total.toFixed(2)} €`);
    }
  } else {
    lines.push('', 'На этой неделе расходов не было.');
  }

  // Best-effort: the monthly run-rate forecast is a bonus in this weekly
  // digest, not its purpose -- a failure here shouldn't block the weekly
  // numbers the user actually waits for every Sunday.
  try {
    const monthly = await getMonthlyReport();
    lines.push(...formatForecastLines(monthly.categoryForecasts, monthly.totalForecast));
  } catch (error) {
    console.error('Failed to build monthly forecast for weekly report:', error);
  }

  const text = truncateForTelegram(lines.join('\n'));

  for (const userId of env.ALLOWED_USER_IDS) {
    try {
      await bot.api.sendMessage(userId, text);
    } catch (error) {
      console.error(`Failed to send weekly report to ${userId}:`, error);
    }
  }
}

export function startWeeklyReportJob(): void {
  const scheduleNext = () => {
    const delay = msUntilNextSunday(SEND_HOUR, new Date());
    setTimeout(() => {
      void sendWeeklyReport().finally(scheduleNext);
    }, delay);
  };

  scheduleNext();
}
