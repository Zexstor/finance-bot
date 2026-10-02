export type TransactionType = 'expense' | 'income';
export type TransactionSource = 'text' | 'voice' | 'photo';

export interface User {
  id: number;
  name: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: TransactionType;
  amount: number;
  category_id: number | null;
  description: string | null;
  source: TransactionSource;
  receipt_id: number | null;
  created_at: string;
}

export interface Receipt {
  id: number;
  user_id: number;
  store_name: string | null;
  total_amount: number | null;
  image_path: string;
  created_at: string;
  expires_at: string;
}
