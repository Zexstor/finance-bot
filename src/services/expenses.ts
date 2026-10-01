import { supabase } from '../db/client.js';

export async function recordExpense(userId: number, amount: number, note: string): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'expense',
    amount,
    description: note || null,
    source: 'text',
  });

  if (error) {
    throw error;
  }
}
