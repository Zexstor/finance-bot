import { supabase } from '../db/client.js';
import type { TransactionType } from '../types/db.js';

export async function recordTransaction(
  userId: number,
  type: TransactionType,
  amount: number,
  note: string,
  categoryId: number | null,
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type,
    amount,
    description: note || null,
    source: 'text',
    category_id: categoryId,
  });

  if (error) {
    throw error;
  }
}

export interface RemovedTransaction {
  type: TransactionType;
  amount: number;
  description: string | null;
  authorName: string;
}

export async function deleteLastTransaction(): Promise<RemovedTransaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, description, author:users(name)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { error: deleteError } = await supabase.from('transactions').delete().eq('id', data.id);

  if (deleteError) {
    throw deleteError;
  }

  return {
    type: data.type,
    amount: Number(data.amount),
    description: data.description,
    authorName: data.author?.[0]?.name ?? 'Неизвестно',
  };
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
