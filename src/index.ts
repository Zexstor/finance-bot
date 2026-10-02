import { bot } from './bot/bot.js';
import { startReceiptCleanupJob } from './jobs/expire-receipts.js';
import { startWeeklyReportJob } from './jobs/weekly-report.js';

await bot.api.setMyCommands([
  { command: 'start', description: 'Запустить бота' },
  { command: 'list', description: 'Последние 20 операций' },
  { command: 'report', description: 'Отчёт за месяц' },
  { command: 'setgoal', description: 'Задать цель по доходу' },
  { command: 'undo', description: 'Отменить последнюю операцию' },
  { command: 'categories', description: 'Добавить/удалить категории' },
]);

startReceiptCleanupJob();
startWeeklyReportJob();
bot.start();
console.log('finance-bot: bot started');
