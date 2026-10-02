import { supabase } from './client.js';

const RETENTION_DAYS = 30;

export interface ReceiptItemInput {
  name: string;
  amount: number;
  categoryId: number | null;
}

export async function saveReceipt(
  userId: number,
  storeName: string | null,
  totalAmount: number | null,
  imagePath: string,
  items: ReceiptItemInput[],
): Promise<void> {
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      store_name: storeName,
      total_amount: totalAmount,
      image_path: imagePath,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (receiptError) {
    throw receiptError;
  }

  const rows = items.map((item) => ({
    user_id: userId,
    type: 'expense' as const,
    amount: item.amount,
    description: item.name,
    source: 'photo' as const,
    category_id: item.categoryId,
    receipt_id: receipt.id,
  }));

  const { error: itemsError } = await supabase.from('transactions').insert(rows);

  if (itemsError) {
    // Best-effort cleanup: supabase-js has no cross-table transaction, so
    // without this a failed items insert would leave an orphaned receipt
    // row (and its already-uploaded photo) with no line items attached.
    await supabase.from('receipts').delete().eq('id', receipt.id);
    throw itemsError;
  }
}

export interface ExpiredReceipt {
  id: number;
  image_path: string;
}

export async function listExpiredReceipts(): Promise<ExpiredReceipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, image_path')
    .lt('expires_at', new Date().toISOString());

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function deleteReceiptRow(id: number): Promise<void> {
  const { error } = await supabase.from('receipts').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
