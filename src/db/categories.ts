import { supabase } from './client.js';
import type { Category, TransactionType } from '../types/db.js';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id, name, type').order('id');

  if (error) {
    throw error;
  }

  return data;
}

export async function addCategory(
  name: string,
  type: TransactionType,
): Promise<{ ok: true; category: Category } | { ok: false; reason: 'duplicate' }> {
  const { data, error } = await supabase.from('categories').insert({ name, type }).select('id, name, type').single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }

  return { ok: true, category: data };
}

export async function deleteCategory(id: number): Promise<{ ok: true } | { ok: false; reason: 'in_use' }> {
  const { error } = await supabase.from('categories').delete().eq('id', id);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: 'in_use' };
    }
    throw error;
  }

  return { ok: true };
}
