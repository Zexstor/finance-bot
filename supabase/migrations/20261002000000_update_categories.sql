-- Categories now belong to either expenses or income (a name can repeat across the two, e.g. "Подарки")
alter table categories add column type text not null default 'expense' check (type in ('expense', 'income'));
alter table categories drop constraint categories_name_key;
alter table categories add constraint categories_name_type_key unique (name, type);
alter table categories alter column type drop default;

delete from categories;

insert into categories (name, type) values
  ('Продукты и БХ', 'expense'),
  ('Кафе и рестораны', 'expense'),
  ('Для ребёнка', 'expense'),
  ('Красота и гигиена', 'expense'),
  ('Аптека и здоровье', 'expense'),
  ('Транспорт', 'expense'),
  ('Связь и интернет', 'expense'),
  ('Для дома', 'expense'),
  ('Одежда', 'expense'),
  ('Подарки', 'expense'),
  ('Инвестиции', 'expense'),
  ('Сбережения', 'income'),
  ('Зарплата', 'income'),
  ('Премия', 'income'),
  ('Процентный доход', 'income'),
  ('Подарки', 'income'),
  ('Подработки', 'income');
