-- O aplicativo usa sessão própria no servidor; a API pública do Supabase não
-- pode acessar o histórico fiscal diretamente. Preserva registros existentes.
set local lock_timeout = '5s';
alter table public.hb_credit_fiscal_notes enable row level security;
revoke all on table public.hb_credit_fiscal_notes from public, anon, authenticated;
grant all on table public.hb_credit_fiscal_notes to service_role;
