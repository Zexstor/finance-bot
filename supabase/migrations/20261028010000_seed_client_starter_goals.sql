-- Placeholder monthly goals for a brand-new client with no spreadsheet
-- history to carry over. These are round demo numbers, not real budget
-- data -- the client edits them via the bot's /categories screen
-- (🎯 button) once they know their own numbers.
update categories set monthly_goal = 300 where name = 'Продукты и БХ' and type = 'expense';
update categories set monthly_goal = 100 where name = 'Кафе и рестораны' and type = 'expense';
update categories set monthly_goal = 150 where name = 'Для ребёнка' and type = 'expense';
update categories set monthly_goal = 50  where name = 'Красота и гигиена' and type = 'expense';
update categories set monthly_goal = 50  where name = 'Аптека и здоровье' and type = 'expense';
update categories set monthly_goal = 80  where name = 'Транспорт' and type = 'expense';
update categories set monthly_goal = 30  where name = 'Связь и интернет' and type = 'expense';
update categories set monthly_goal = 50  where name = 'Для дома' and type = 'expense';
update categories set monthly_goal = 50  where name = 'Одежда' and type = 'expense';
update categories set monthly_goal = 50  where name = 'Подарки' and type = 'expense';
update categories set monthly_goal = 100 where name = 'Инвестиции' and type = 'expense';
