// Pure parsing for the "type a number to set the starting balance" text
// reply. Unlike a category goal, negative balances are explicitly allowed
// (an overspent month carries over as debt), and the input may use spaces
// as thousands separators and/or a comma decimal separator.

export type ParsedStartingBalance = { ok: true; amount: number } | { ok: false };

export function parseStartingBalanceInput(text: string): ParsedStartingBalance {
  const normalized = text.trim().replace(/\s+/g, '').replace(',', '.');

  if (!normalized) {
    return { ok: false };
  }

  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    return { ok: false };
  }

  return { ok: true, amount: value };
}
