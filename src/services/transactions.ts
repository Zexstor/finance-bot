import { supabase } from '../db/client.js';
import type { TransactionType } from '../types/db.js';

export async function recordTransaction(
  userId: number,
  type: TransactionType,
  amount: number,
  note: string,
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type,
    amount,
    description: note || null,
    source: 'text',
  });

  if (error) {
    throw error;
  }
}

export interface TransactionListItem {
  type: TransactionType;
  amount: number;
  description: string | null;
  created_at: string;
  authorName: string;
  categoryName: string | null;
}

export async function listRecentTransactions(limit: number): Promise<TransactionListItem[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, description, created_at, author:users(name), category:categories(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    created_at: row.created_at,
    authorName: row.author?.[0]?.name ?? 'Неизвестно',
    categoryName: row.category?.[0]?.name ?? null,
  }));
}
