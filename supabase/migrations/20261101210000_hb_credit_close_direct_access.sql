-- API própria valida sessão, CNPJ e PIN; acesso direto não deve contorná-la.
begin;
set local lock_timeout = '5s';
alter table public.hb_credit_cooperado_ficha_plano enable row level security;
revoke all on table public.hb_credit_cooperado_ficha_plano from anon, authenticated;
grant all on table public.hb_credit_cooperado_ficha_plano to service_role;
revoke execute on function public.hb_credit_authorize_cooperado_transfer(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.hb_credit_authorize_cooperado_transfer(text,text,text,text,text,text) to service_role;
commit;
