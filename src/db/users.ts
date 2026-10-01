import { supabase } from './client.js';

export async function ensureUser(id: number, name: string): Promise<void> {
  const { error } = await supabase.from('users').upsert({ id, name }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    throw error;
  }
}
