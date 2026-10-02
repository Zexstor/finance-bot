import { supabase } from '../db/client.js';
import type { TransactionType, TransactionSource } from '../types/db.js';

// supabase-js infers to-one embeds as arrays without generated DB types;
// at runtime PostgREST actually returns a single object (or null) here.
interface EmbeddedName {
  name: string;
}

export async function recordTransaction(
  userId: number,
  type: TransactionType,
  amount: number,
  note: string,
  categoryId: number | null,
  source: TransactionSource = 'text',
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type,
    amount,
    description: note || null,
    source,
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
  // Atomic server-side select+delete (a Postgres function) instead of a
  // client-side select-then-delete, which had a race window between the
  // two round trips.
  const { data, error } = await supabase
    .rpc('delete_last_transaction')
    .single<{
      user_id: number;
      type: TransactionType;
      amount: number;
      description: string | null;
    }>();

  if (error) {
    throw error;
  }

  if (!data || data.user_id === null) {
    return null;
  }

  const { data: author } = await supabase.from('users').select('name').eq('id', data.user_id).maybeSingle();

  return {
    type: data.type,
    amount: Number(data.amount),
    description: data.description,
    authorName: author?.name ?? 'Неизвестно',
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
    .limit(limit)
    .returns<
      {
        type: TransactionType;
        amount: number;
        description: string | null;
        created_at: string;
        author: EmbeddedName | null;
        category: EmbeddedName | null;
      }[]
    >();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    created_at: row.created_at,
    authorName: row.author?.name ?? 'Неизвестно',
    categoryName: row.category?.name ?? null,
  }));
}
