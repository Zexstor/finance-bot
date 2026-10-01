type ParseResult =
  | { ok: true; amount: number; note: string }
  | { ok: false; reason: 'no_amount' | 'multiple_amounts' | 'invalid_amount' };

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

export function parseExpenseText(text: string): ParseResult {
  const matches = text.match(NUMBER_PATTERN);

  if (!matches || matches.length === 0) {
    return { ok: false, reason: 'no_amount' };
  }

  if (matches.length > 1) {
    return { ok: false, reason: 'multiple_amounts' };
  }

  const amount = Number(matches[0].replace(',', '.'));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const note = text.replace(matches[0], '').replace(/\s+/g, ' ').trim();

  return { ok: true, amount, note };
}
