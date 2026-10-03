const TELEGRAM_MESSAGE_LIMIT = 4000;

export function truncateForTelegram(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n\n(сообщение обрезано, оно получилось слишком длинным)`;
}

export function formatBalanceLine(balance: number): string {
  const label = balance >= 0 ? 'Остаток за месяц' : 'Перерасход за месяц';
  return `${label}: ${Math.abs(balance).toFixed(2)} €`;
}

export interface CategoryTotalLike {
  name: string;
  total: number;
}

export function formatQueryAnswer(
  periodLabel: string,
  income: number,
  totalExpenses: number,
  expensesByCategory: CategoryTotalLike[],
  categoryName: string | null,
): string {
  if (categoryName) {
    const match = expensesByCategory.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    const amount = match?.total ?? 0;
    return `Расходы на «${categoryName}» за ${periodLabel}: ${amount.toFixed(2)} €`;
  }

  const balance = income - totalExpenses;
  return (
    `За ${periodLabel}: доход ${income.toFixed(2)} €, расход ${totalExpenses.toFixed(2)} €, ` +
    `${balance >= 0 ? 'остаток' : 'перерасход'} ${Math.abs(balance).toFixed(2)} €`
  );
}
