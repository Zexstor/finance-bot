import { supabase } from '../db/client.js';
import { calculateMonthlyForecast } from './forecast-logic.js';
import { getCategories } from '../db/categories.js';

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
  incomeCategoryForecasts: CategoryForecast[];
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

  const [incomeResult, expenseResult, goal, categories] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, category:categories(id, name)')
      .eq('type', 'income')
      .gte('created_at', start)
      .lt('created_at', end)
      .returns<{ amount: number; category: { id: number; name: string } | null }[]>(),
    supabase
      .from('transactions')
      .select('amount, category:categories(id, name)')
      .eq('type', 'expense')
      .gte('created_at', start)
      .lt('created_at', end)
      .returns<{ amount: number; category: { id: number; name: string } | null }[]>(),
    getMonthlyGoal(),
    getCategories(),
  ]);

  if (incomeResult.error) {
    throw incomeResult.error;
  }
  if (expenseResult.error) {
    throw expenseResult.error;
  }

  const income = (incomeResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  const earnedByCategoryId = new Map<number, number>();
  for (const row of incomeResult.data ?? []) {
    if (row.category) {
      earnedByCategoryId.set(row.category.id, (earnedByCategoryId.get(row.category.id) ?? 0) + Number(row.amount));
    }
  }

  const byCategory = new Map<string, number>();
  const spentByCategoryId = new Map<number, number>();
  for (const row of expenseResult.data ?? []) {
    const name = row.category?.name ?? 'Без категории';
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(row.amount));
    if (row.category) {
      spentByCategoryId.set(row.category.id, (spentByCategoryId.get(row.category.id) ?? 0) + Number(row.amount));
    }
  }

  const expensesByCategory = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const totalExpenses = expensesByCategory.reduce((sum, c) => sum + c.total, 0);

  // Every expense category gets a forecast line, even one with nothing
  // spent yet this month -- a category with a goal but no transactions so
  // far should still show its target. A category with an explicit
  // monthly_goal (set via /categories) uses that fixed number; otherwise it
  // falls back to a spend-rate projection.
  const categoryForecasts = categories
    .filter((c) => c.type === 'expense')
    .map((c) => {
      const total = spentByCategoryId.get(c.id) ?? 0;
      const forecast = c.monthly_goal ?? calculateMonthlyForecast(total, daysElapsed);
      return { name: c.name, total, forecast };
    })
    .sort((a, b) => b.forecast - a.forecast);
  const totalForecast = categoryForecasts.reduce((sum, c) => sum + c.forecast, 0);

  // Income doesn't have a meaningful "run rate" fallback the way expenses
  // do (a salary paid once a month isn't linear across days elapsed), so
  // only categories with an explicit goal show up here at all.
  const incomeCategoryForecasts = categories
    .filter((c) => c.type === 'income' && c.monthly_goal !== null)
    .map((c) => ({
      name: c.name,
      total: earnedByCategoryId.get(c.id) ?? 0,
      forecast: c.monthly_goal as number,
    }))
    .sort((a, b) => b.forecast - a.forecast);

  return {
    monthLabel: label,
    income,
    goal,
    expensesByCategory,
    totalExpenses,
    categoryForecasts,
    totalForecast,
    incomeCategoryForecasts,
  };
}
