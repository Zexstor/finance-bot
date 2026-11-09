-- Shared household starting balance per calendar month ("Остаток на начало
-- месяца" from the family's old spreadsheet template). One row per month,
-- not per user: income/expenses everywhere else in this bot are already
-- summed across the whole family rather than filtered by user_id, so the
-- balance follows the same shared-household model. updated_by is just an
-- audit trail of who last entered/changed the amount -- it's nullable
-- because the automatic month-to-month carry-over isn't attributable to a
-- specific person.
create table monthly_balances (
  year integer not null,
  month integer not null check (month between 1 and 12),
  starting_balance numeric not null default 0,
  updated_by bigint references users(id),
  updated_at timestamptz not null default now(),
  primary key (year, month)
);

alter table monthly_balances enable row level security;
