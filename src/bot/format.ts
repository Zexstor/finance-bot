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
