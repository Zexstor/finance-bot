import { listExpiredReceipts, deleteReceiptRow } from '../db/receipts.js';
import { deleteReceiptImage } from '../db/storage.js';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function cleanupExpiredReceipts(): Promise<void> {
  let expired;
  try {
    expired = await listExpiredReceipts();
  } catch (error) {
    console.error('Failed to list expired receipts:', error);
    return;
  }

  for (const receipt of expired) {
    try {
      await deleteReceiptImage(receipt.image_path);
      await deleteReceiptRow(receipt.id);
      console.log(`Expired receipt ${receipt.id} removed`);
    } catch (error) {
      console.error(`Failed to remove expired receipt ${receipt.id}:`, error);
    }
  }
}

export function startReceiptCleanupJob(): void {
  void cleanupExpiredReceipts();
  setInterval(() => {
    void cleanupExpiredReceipts();
  }, CHECK_INTERVAL_MS);
}
