const TELEGRAM_MESSAGE_LIMIT = 4000;

export function truncateForTelegram(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n\n(сообщение обрезано, оно получилось слишком длинным)`;
}

export function formatBalanceLine(balance: number, currency = '€'): string {
  const label = balance >= 0 ? 'Остаток за месяц' : 'Перерасход за месяц';
  return `${label}: ${Math.abs(balance).toFixed(2)} ${currency}`;
}

export interface CategoryTotalLike {
  name: string;
  total: number;
}

export interface CategoryForecastLike extends CategoryTotalLike {
  forecast: number;
}

// A simple run-rate projection (spent-per-day-so-far × 30), not a prediction
// that accounts for e.g. a known upcoming bill -- labelled "ориентир"/"~" so
// it reads as an estimate, not a promise.
export function formatForecastLines(
  categoryForecasts: CategoryForecastLike[],
  totalForecast: number,
  currency = '€',
): string[] {
  if (categoryForecasts.length === 0) {
    return [];
  }

  const lines = ['', '📈 Ориентир на месяц при текущем темпе трат:'];
  for (const category of categoryForecasts) {
    lines.push(`➖ ${category.name}: ~${category.forecast.toFixed(2)} ${currency}`);
  }
  lines.push(`Итого ориентир: ~${totalForecast.toFixed(2)} ${currency}`);
  return lines;
}

// Unlike expense forecasts, these are goal-vs-actual, not a projection --
// income categories with no goal set are left out entirely by the caller,
// so every line here already has something to compare against.
export function formatIncomeGoalLines(incomeCategoryForecasts: CategoryForecastLike[], currency = '€'): string[] {
  if (incomeCategoryForecasts.length === 0) {
    return [];
  }

  const lines = ['', '🎯 Цели по доходам на месяц:'];
  for (const category of incomeCategoryForecasts) {
    lines.push(`➕ ${category.name}: ${category.total.toFixed(2)} / ${category.forecast.toFixed(2)} ${currency}`);
  }
  return lines;
}

export function formatQueryAnswer(
  periodLabel: string,
  income: number,
  totalExpenses: number,
  expensesByCategory: CategoryTotalLike[],
  categoryName: string | null,
  forecast?: { categoryForecasts: CategoryForecastLike[]; totalForecast: number },
  currency = '€',
): string {
  if (categoryName) {
    const match = expensesByCategory.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    const amount = match?.total ?? 0;
    let answer = `Расходы на «${categoryName}» за ${periodLabel}: ${amount.toFixed(2)} ${currency}`;

    const forecastMatch = forecast?.categoryForecasts.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    if (forecastMatch) {
      answer += `\nОриентир на месяц при текущем темпе: ~${forecastMatch.forecast.toFixed(2)} ${currency}`;
    }

    return answer;
  }

  const balance = income - totalExpenses;
  let answer =
    `За ${periodLabel}: доход ${income.toFixed(2)} ${currency}, расход ${totalExpenses.toFixed(2)} ${currency}, ` +
    `${balance >= 0 ? 'остаток' : 'перерасход'} ${Math.abs(balance).toFixed(2)} ${currency}`;

  if (forecast) {
    answer += `\nОриентир расходов на месяц при текущем темпе: ~${forecast.totalForecast.toFixed(2)} ${currency}`;
  }

  return answer;
}
