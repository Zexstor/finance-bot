create or replace function delete_last_transaction()
returns transactions
language plpgsql
as $$
declare
  deleted_row transactions;
begin
  delete from transactions
  where id = (select id from transactions order by created_at desc limit 1)
  returning * into deleted_row;
  return deleted_row;
end;
$$;
