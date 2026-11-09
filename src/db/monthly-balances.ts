import { supabase } from './client.js';

export async function getStoredStartingBalance(year: number, month: number): Promise<number | null> {
  const { data, error } = await supabase
    .from('monthly_balances')
    .select('starting_balance')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle<{ starting_balance: number }>();

  if (error) {
    throw error;
  }

  return data ? Number(data.starting_balance) : null;
}

// updatedBy is null for an automatic month-to-month carry-over (not a
// specific person's action); it's the Telegram user id for a manual edit.
export async function upsertStartingBalance(year: number, month: number, amount: number, updatedBy: number | null): Promise<void> {
  const { error } = await supabase
    .from('monthly_balances')
    .upsert(
      { year, month, starting_balance: amount, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'year,month' },
    );

  if (error) {
    throw error;
  }
}
