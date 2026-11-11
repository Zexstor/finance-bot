-- Distinguishes "the bot defaulted this month's starting balance to 0
-- because nobody had set one yet" from "someone actually confirmed this
-- number" (either by typing it in, or by it being a rollover from an
-- already-confirmed month). Without this, the one-time "please set your
-- starting balance" prompt could only ever fire once per month, even if
-- nobody saw it -- the lazy carry-over persists a row (and thus silences
-- the prompt) the first time *anything* reads that month, not just when a
-- person does.
alter table monthly_balances add column is_confirmed boolean not null default false;
