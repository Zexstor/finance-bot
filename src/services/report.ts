import { supabase } from '../db/client.js';
import { calculateMonthlyForecast } from './forecast-logic.js';

// supabase-js infers to-one embeds as arrays without generated DB types;
// at runtime PostgREST actually returns a single object (or null) here.
interface EmbeddedName {
  name: string;
}

export interface CategoryTotal {
  name: string;
  total: number;
}

export interface CategoryForecast extends CategoryTotal {
  forecast: number;
}

export interface MonthlyReport {
  monthLabel: string;
  income: number;
  goal: number;
  expensesByCategory: CategoryTotal[];
  totalExpenses: number;
  categoryForecasts: CategoryForecast[];
  totalForecast: number;
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

function getWeekRange(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diffToMonday);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return { start: monday.toISOString(), end: nextMonday.toISOString() };
}

export interface WeeklyReport {
  income: number;
  totalExpenses: number;
  balance: number;
  expensesByCategory: CategoryTotal[];
}

export async function getWeeklyReport(): Promise<WeeklyReport> {
  const { start, end } = getWeekRange();

  const [incomeResult, expenseResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'income')
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('transactions')
      .select('amount, category:categories(name)')
      .eq('type', 'expense')
      .gte('created_at', start)
      .lt('created_at', end)
      .returns<{ amount: number; category: EmbeddedName | null }[]>(),
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

  return { income, totalExpenses, balance: income - totalExpenses, expensesByCategory };
}

export async function getMonthlyBalance(): Promise<number> {
  const { start, end } = getMonthRange();

  const [incomeResult, expenseResult] = await Promise.all([
    supabase.from('transactions').select('amount').eq('type', 'income').gte('created_at', start).lt('created_at', end),
    supabase.from('transactions').select('amount').eq('type', 'expense').gte('created_at', start).lt('created_at', end),
  ]);

  if (incomeResult.error) {
    throw incomeResult.error;
  }
  if (expenseResult.error) {
    throw expenseResult.error;
  }

  const income = (incomeResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = (expenseResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  return income - expenses;
}

export async function getMonthlyReport(): Promise<MonthlyReport> {
  const now = new Date();
  const { start, end, label } = getMonthRange(now);
  const daysElapsed = now.getDate();

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

  const categoryForecasts = expensesByCategory.map((c) => ({
    ...c,
    forecast: calculateMonthlyForecast(c.total, daysElapsed),
  }));
  const totalForecast = calculateMonthlyForecast(totalExpenses, daysElapsed);

  return { monthLabel: label, income, goal, expensesByCategory, totalExpenses, categoryForecasts, totalForecast };
}
