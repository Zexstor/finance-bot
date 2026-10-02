import { supabase } from './client.js';

const BUCKET = 'receipts';

export async function uploadReceiptImage(path: string, image: Buffer): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: 'image/jpeg' });

  if (error) {
    throw error;
  }
}

export async function deleteReceiptImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    throw error;
  }
}
