import { supabase } from '../db/client.js';

// supabase-js infers to-one embeds as arrays without generated DB types;
// at runtime PostgREST actually returns a single object (or null) here.
interface EmbeddedName {
  name: string;
}

export interface CategoryTotal {
  name: string;
  total: number;
}

export interface MonthlyReport {
  monthLabel: string;
  income: number;
  goal: number;
  expensesByCategory: CategoryTotal[];
  totalExpenses: number;
}

function getMonthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1));
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return { start: start.toISOString(), end: end.toISOString(), label };
}

export async function getMonthlyGoal(): Promise<number> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'monthly_income_goal')
    .single();

  if (error) {
    throw error;
  }

  return Number(data.value) || 0;
}

export async function setMonthlyGoal(amount: number): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .update({ value: String(amount) })
    .eq('key', 'monthly_income_goal');

  if (error) {
    throw error;
  }
}

export async function getMonthlyReport(): Promise<MonthlyReport> {
  const { start, end, label } = getMonthRange();

  const [incomeResult, expenseResult, goal] = await Promise.all([
    supabase.from('transactions').select('amount').eq('type', 'income').gte('created_at', start).lt('created_at', end),
    supabase
      .from('transactions')
      .select('amount, category:categories(name)')
      .eq('type', 'expense')
      .gte('created_at', start)
      .lt('created_at', end)
      .returns<{ amount: number; category: EmbeddedName | null }[]>(),
    getMonthlyGoal(),
  ]);

  if (incomeResult.error) {
    throw incomeResult.error;
  }
  if (expenseResult.error) {
    throw expenseResult.error;
  }

  const income = (incomeResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  const byCategory = new Map<string, number>();
  for (const row of expenseResult.data ?? []) {
    const name = row.category?.name ?? 'Без категории';
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(row.amount));
  }

  const expensesByCategory = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const totalExpenses = expensesByCategory.reduce((sum, c) => sum + c.total, 0);

  return { monthLabel: label, income, goal, expensesByCategory, totalExpenses };
}
