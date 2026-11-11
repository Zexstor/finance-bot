import { supabase } from './client.js';

export interface StoredBalance {
  startingBalance: number;
  isConfirmed: boolean;
}

export async function getStoredStartingBalance(year: number, month: number): Promise<StoredBalance | null> {
  const { data, error } = await supabase
    .from('monthly_balances')
    .select('starting_balance, is_confirmed')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle<{ starting_balance: number; is_confirmed: boolean }>();

  if (error) {
    throw error;
  }

  return data ? { startingBalance: Number(data.starting_balance), isConfirmed: data.is_confirmed } : null;
}

// updatedBy is null for an automatic month-to-month carry-over (not a
// specific person's action); it's the Telegram user id for a manual edit.
export async function upsertStartingBalance(
  year: number,
  month: number,
  amount: number,
  isConfirmed: boolean,
  updatedBy: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('monthly_balances')
    .upsert(
      { year, month, starting_balance: amount, is_confirmed: isConfirmed, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'year,month' },
    );

  if (error) {
    throw error;
  }
}
