import { supabase } from './client.js';

// The month -> spreadsheet mapping lives in the existing key/value `settings`
// table (keys like "sheet:2026-11"), so no schema migration is needed and the
// bot reaches it with the same service-role client it already uses. Each
// calendar month has its own Google Sheet; this is how the bot finds the one
// to write to for a given month.
const KEY_PREFIX = 'sheet:';

const keyFor = (month: string): string => `${KEY_PREFIX}${month}`;

export async function getSheetIdForMonth(month: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', keyFor(month))
    .maybeSingle<{ value: string }>();

  if (error) {
    throw error;
  }

  return data?.value ?? null;
}

export async function setSheetIdForMonth(month: string, spreadsheetId: string): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: keyFor(month), value: spreadsheetId }, { onConflict: 'key' });

  if (error) {
    throw error;
  }
}

export interface MonthlySheet {
  month: string;
  spreadsheetId: string;
}

export async function listMonthlySheets(): Promise<MonthlySheet[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', `${KEY_PREFIX}%`)
    .returns<{ key: string; value: string }[]>();

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => ({ month: row.key.slice(KEY_PREFIX.length), spreadsheetId: row.value }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
