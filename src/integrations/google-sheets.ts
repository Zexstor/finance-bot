import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { env } from '../config/env.js';
import {
  columnsFor,
  toSheetsSerial,
  buildTemplateRowValues,
  type TemplateRowInput,
  type TemplateColumns,
} from './sheet-row.js';

const SHEET_TITLE = 'Транзакции';
const FIRST_DATA_ROW = 4; // 0-indexed; matches where the template's own example rows start
const MAX_ROW = 999;
const DATE_FORMAT = { type: 'DATE' as const, pattern: 'DD.MM.YYYY' };

let cachedSheet: GoogleSpreadsheetWorksheet | null = null;

function isConfigured(): boolean {
  return Boolean(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && env.GOOGLE_SHEET_ID,
  );
}

async function getSheet(): Promise<GoogleSpreadsheetWorksheet> {
  if (cachedSheet) {
    return cachedSheet;
  }

  const jwt = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // .env stores the key with literal "\n" escapes; Google's SDK needs real newlines.
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID as string, jwt);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[SHEET_TITLE];
  if (!sheet) {
    throw new Error(`Sheet tab "${SHEET_TITLE}" not found`);
  }

  cachedSheet = sheet;
  return sheet;
}

function isCellEmpty(sheet: GoogleSpreadsheetWorksheet, row: number, col: number): boolean {
  const value = sheet.getCell(row, col).value;
  return value === null || value === '';
}

// A row counts as free only if ALL four of its cells are empty. The user's
// real template already has at least one row with data in amount/description
// but no date (manually entered, date left blank) -- checking the date
// column alone would have targeted that row and overwritten their entry.
async function findFirstEmptyRow(sheet: GoogleSpreadsheetWorksheet, cols: TemplateColumns): Promise<number> {
  await sheet.loadCells({
    startRowIndex: FIRST_DATA_ROW,
    endRowIndex: MAX_ROW,
    startColumnIndex: cols.date,
    endColumnIndex: cols.category + 1,
  });

  for (let r = FIRST_DATA_ROW; r < MAX_ROW; r++) {
    if (
      isCellEmpty(sheet, r, cols.date) &&
      isCellEmpty(sheet, r, cols.amount) &&
      isCellEmpty(sheet, r, cols.description) &&
      isCellEmpty(sheet, r, cols.category)
    ) {
      return r;
    }
  }

  throw new Error('No empty row found in the budget template (sheet is full)');
}

type RowWithDate = TemplateRowInput & { createdAt: string };

function writeRowCells(sheet: GoogleSpreadsheetWorksheet, targetRow: number, cols: TemplateColumns, row: RowWithDate): void {
  const values = buildTemplateRowValues(row);
  const dateCell = sheet.getCell(targetRow, cols.date);
  dateCell.value = toSheetsSerial(new Date(row.createdAt));
  dateCell.numberFormat = DATE_FORMAT;
  sheet.getCell(targetRow, cols.amount).value = values.amount;
  sheet.getCell(targetRow, cols.description).value = values.description;
  sheet.getCell(targetRow, cols.category).value = values.category;
}

export async function appendTransactionRow(row: RowWithDate): Promise<void> {
  return appendTransactionRows([row]);
}

// Writes every row with ONE scan-for-empty-row per type block and ONE final
// save, instead of a full loadCells+saveUpdatedCells round trip per item.
// A receipt with many line items awaited sequentially (needed to avoid the
// "multiple items race to the same empty row" bug) was slow enough to blow
// past Telegram's callback-query validity window -- answerCallbackQuery
// failed with "query is too old", so the user never saw any confirmation
// even though the save itself had already gone through.
export async function appendTransactionRows(rows: RowWithDate[]): Promise<void> {
  if (!isConfigured() || rows.length === 0) {
    return;
  }

  try {
    const sheet = await getSheet();

    const byType = new Map<RowWithDate['type'], RowWithDate[]>();
    for (const row of rows) {
      const group = byType.get(row.type) ?? [];
      group.push(row);
      byType.set(row.type, group);
    }

    for (const [type, group] of byType) {
      const cols = columnsFor(type);
      // Loads the full column range for every candidate row, so cells for
      // startRow..startRow+group.length-1 are all cached and ready to write.
      const startRow = await findFirstEmptyRow(sheet, cols);

      group.forEach((row, i) => writeRowCells(sheet, startRow + i, cols, row));
    }

    await sheet.saveUpdatedCells();
  } catch (error) {
    // Don't log the raw error object: google-auth-library errors embed the
    // outgoing request, including the live Authorization bearer token.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to append rows to Google Sheet:', message);
  }
}

// The template has no hidden transaction-id column, so a specific row can
// only be located by matching description + amount within its type block.
// Returns null (and touches nothing) unless the match is unique -- editing
// or clearing the wrong row of a shared family spreadsheet on a guess is
// worse than leaving one row stale.
async function findUniqueRow(
  sheet: GoogleSpreadsheetWorksheet,
  cols: TemplateColumns,
  description: string,
  amount: number,
): Promise<number | null> {
  await sheet.loadCells({
    startRowIndex: FIRST_DATA_ROW,
    endRowIndex: MAX_ROW,
    startColumnIndex: cols.amount,
    endColumnIndex: cols.description + 1,
  });

  const normalizedTarget = description.trim().toLowerCase();
  const matches: number[] = [];

  for (let r = FIRST_DATA_ROW; r < MAX_ROW; r++) {
    const amountValue = sheet.getCell(r, cols.amount).value;
    const descValue = sheet.getCell(r, cols.description).value;

    if (
      typeof amountValue === 'number' &&
      Math.abs(amountValue - amount) < 0.005 &&
      typeof descValue === 'string' &&
      descValue.trim().toLowerCase() === normalizedTarget
    ) {
      matches.push(r);
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

export interface SheetRowMatch {
  type: RowWithDate['type'];
  amount: number;
  description: string;
}

export interface SheetRowEdits {
  amount?: number;
  description?: string;
  categoryName?: string;
}

export async function updateTransactionInSheet(match: SheetRowMatch, edits: SheetRowEdits): Promise<void> {
  if (!isConfigured()) {
    return;
  }

  try {
    const sheet = await getSheet();
    const cols = columnsFor(match.type);
    const row = await findUniqueRow(sheet, cols, match.description, match.amount);

    if (row === null) {
      console.error('updateTransactionInSheet: could not uniquely locate the row (not found or ambiguous)');
      return;
    }

    if (edits.amount !== undefined) {
      sheet.getCell(row, cols.amount).value = edits.amount;
    }
    if (edits.description !== undefined) {
      sheet.getCell(row, cols.description).value = edits.description;
    }
    if (edits.categoryName !== undefined) {
      sheet.getCell(row, cols.category).value = edits.categoryName;
    }

    await sheet.saveUpdatedCells();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to update row in Google Sheet:', message);
  }
}

export async function deleteTransactionFromSheet(match: SheetRowMatch): Promise<void> {
  if (!isConfigured()) {
    return;
  }

  try {
    const sheet = await getSheet();
    const cols = columnsFor(match.type);
    const row = await findUniqueRow(sheet, cols, match.description, match.amount);

    if (row === null) {
      console.error('deleteTransactionFromSheet: could not uniquely locate the row (not found or ambiguous)');
      return;
    }

    for (const col of [cols.date, cols.amount, cols.description, cols.category]) {
      sheet.getCell(row, col).value = '';
    }

    await sheet.saveUpdatedCells();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to clear row in Google Sheet:', message);
  }
}
