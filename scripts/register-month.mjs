#!/usr/bin/env node
// Register a month -> Google Sheet mapping for the bot, and optionally clear
// the transaction rows carried over from the copied previous month.
//
// Usage:
//   node scripts/register-month.mjs <YYYY-MM> <sheetUrlOrId> [--clear]
//
// Steps a new month each month:
//   1. In Google Sheets: File -> Make a copy of the previous month.
//   2. Share the copy with the service account (Editor).
//   3. Run this with --clear to wipe the copied transactions and register it.
//
// Reads credentials from .env. The month -> sheet mapping is stored in the
// `settings` table (key "sheet:<YYYY-MM>").
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const SHEET_TITLE = 'Транзакции';
const FIRST_DATA_ROW = 4; // 0-indexed
const MAX_ROW = 999;
const EXPENSE = { date: 1, amount: 2, description: 3, category: 4 };
const INCOME = { date: 6, amount: 7, description: 8, category: 9 };

const [, , monthArg, sheetArg, ...flags] = process.argv;
const doClear = flags.includes('--clear');

if (!monthArg || !/^\d{4}-\d{2}$/.test(monthArg) || !sheetArg) {
  console.error('Usage: node scripts/register-month.mjs <YYYY-MM> <sheetUrlOrId> [--clear]');
  process.exit(1);
}

function parseSheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}
const spreadsheetId = parseSheetId(sheetArg);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function clearTransactions() {
  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(spreadsheetId, jwt);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[SHEET_TITLE];
  if (!sheet) {
    throw new Error(`Sheet tab "${SHEET_TITLE}" not found`);
  }
  await sheet.loadCells({ startRowIndex: FIRST_DATA_ROW, endRowIndex: MAX_ROW, startColumnIndex: 1, endColumnIndex: 10 });

  let cleared = 0;
  for (const cols of [EXPENSE, INCOME]) {
    for (let r = FIRST_DATA_ROW; r < MAX_ROW; r++) {
      const cells = [cols.date, cols.amount, cols.description, cols.category].map((c) => sheet.getCell(r, c));
      const hasData = cells.some((cell) => !(cell.value === null || cell.value === ''));
      if (hasData) {
        for (const cell of cells) cell.value = '';
        cleared++;
      }
    }
  }
  await sheet.saveUpdatedCells();
  return { title: doc.title, cleared };
}

if (doClear) {
  const { title, cleared } = await clearTransactions();
  console.log(`Cleared ${cleared} transaction row(s) in "${title}".`);
}

const { error } = await supabase
  .from('settings')
  .upsert({ key: `sheet:${monthArg}`, value: spreadsheetId }, { onConflict: 'key' });
if (error) {
  console.error('Failed to register month in settings:', error.message);
  process.exit(1);
}

console.log(`Registered ${monthArg} -> ${spreadsheetId}`);
