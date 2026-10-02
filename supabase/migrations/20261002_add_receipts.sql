create table receipts (
  id bigserial primary key,
  user_id bigint not null references users(id),
  store_name text,
  total_amount numeric(12,2),
  image_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table transactions add column receipt_id bigint references receipts(id) on delete set null;

create index receipts_expires_at_idx on receipts(expires_at);
create index transactions_receipt_id_idx on transactions(receipt_id);

alter table receipts enable row level security;

-- Private bucket for receipt photos; only the bot's service_role key can read/write it.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
