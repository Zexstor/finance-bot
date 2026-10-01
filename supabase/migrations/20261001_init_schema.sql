-- Family members allowed to use the bot
create table users (
  id bigint primary key, -- Telegram user id
  name text not null,
  created_at timestamptz not null default now()
);

-- Expense categories (seeded with defaults, extendable later)
create table categories (
  id serial primary key,
  name text not null unique
);

insert into categories (name) values
  ('Еда'),
  ('Транспорт'),
  ('Жильё'),
  ('Развлечения'),
  ('Здоровье'),
  ('Покупки'),
  ('Прочее');

-- Expenses and incomes
create table transactions (
  id bigserial primary key,
  user_id bigint not null references users(id),
  type text not null check (type in ('expense', 'income')),
  amount numeric(12, 2) not null check (amount > 0),
  category_id integer references categories(id),
  description text,
  source text not null default 'text' check (source in ('text', 'voice', 'photo')),
  created_at timestamptz not null default now()
);

create index transactions_user_id_idx on transactions(user_id);
create index transactions_created_at_idx on transactions(created_at);

-- Single shared monthly income goal for the family
create table settings (
  key text primary key,
  value text not null
);

insert into settings (key, value) values ('monthly_income_goal', '0');
