-- Bot uses the service_role key, which always bypasses RLS regardless of policies.
-- Enabling RLS with no policies default-denies the anon/publishable key entirely.
alter table users enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table settings enable row level security;
