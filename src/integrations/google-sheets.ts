import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { env } from '../config/env.js';
import { formatSheetRow, type SheetRowInput } from './sheet-row.js';

const SHEET_TITLE = 'Transactions';
const HEADER = ['Date', 'Type', 'Amount', 'Category', 'Note', 'Author', 'Source'];

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

  let sheet = doc.sheetsByTitle[SHEET_TITLE];
  if (!sheet) {
    sheet = await doc.addSheet({ title: SHEET_TITLE, headerValues: HEADER });
  }

  cachedSheet = sheet;
  return sheet;
}

export async function appendTransactionRow(row: SheetRowInput): Promise<void> {
  if (!isConfigured()) {
    return;
  }

  try {
    const sheet = await getSheet();
    await sheet.addRow(formatSheetRow(row));
  } catch (error) {
    // Don't log the raw error object: google-auth-library errors embed the
    // outgoing request, including the live Authorization bearer token.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to append row to Google Sheet:', message);
  }
}
