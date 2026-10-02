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

export async function appendTransactionRow(row: TemplateRowInput & { createdAt: string }): Promise<void> {
  if (!isConfigured()) {
    return;
  }

  try {
    const sheet = await getSheet();
    const cols = columnsFor(row.type);
    // findFirstEmptyRow already loads the full column range for every
    // candidate row, so the cells for targetRow are cached and ready to
    // write without a second round trip.
    const targetRow = await findFirstEmptyRow(sheet, cols);

    const values = buildTemplateRowValues(row);
    const dateCell = sheet.getCell(targetRow, cols.date);
    dateCell.value = toSheetsSerial(new Date(row.createdAt));
    dateCell.numberFormat = DATE_FORMAT;
    sheet.getCell(targetRow, cols.amount).value = values.amount;
    sheet.getCell(targetRow, cols.description).value = values.description;
    sheet.getCell(targetRow, cols.category).value = values.category;

    await sheet.saveUpdatedCells();
  } catch (error) {
    // Don't log the raw error object: google-auth-library errors embed the
    // outgoing request, including the live Authorization bearer token.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to append row to Google Sheet:', message);
  }
}
