-- A fixed monthly budget target per category, set by the user through the
-- bot (no spreadsheet required). Null means "no goal set" -- the forecast
-- falls back to a spend-rate projection for that category.
alter table categories add column monthly_goal numeric;
