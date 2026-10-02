import { bot } from './bot/bot.js';
import { startReceiptCleanupJob } from './jobs/expire-receipts.js';

startReceiptCleanupJob();
bot.start();
console.log('finance-bot: bot started');
