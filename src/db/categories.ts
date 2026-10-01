import { supabase } from './client.js';
import type { Category } from '../types/db.js';

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id, name, type').order('id');

  if (error) {
    throw error;
  }

  return data;
}
