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
}

export interface Transaction {
  id: number;
  user_id: number;
  type: TransactionType;
  amount: number;
  category_id: number | null;
  description: string | null;
  source: TransactionSource;
  created_at: string;
}
