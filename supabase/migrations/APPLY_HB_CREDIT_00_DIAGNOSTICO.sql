-- Cole no SQL Editor do MESMO projeto Supabase do app (Settings → API → Project URL).
-- Se hb_credit_accounts = false, o HB Créditos ainda nao foi instalado neste banco.

select
  current_database() as banco,
  to_regclass('public.hb_credit_accounts') is not null as hb_credit_accounts,
  to_regclass('public.hb_credit_cooperative_caps') is not null as hb_credit_cooperative_caps,
  to_regclass('public.hb_credit_transactions') is not null as hb_credit_transactions,
  to_regclass('public.app_users') is not null as app_users;

-- Proximo passo se hb_credit_accounts = false:
--   1) Execute INTEIRO: supabase/migrations/APPLY_HB_CREDIT_TUDO.sql
--   2) Depois execute INTEIRO: supabase/migrations/APPLY_HB_CREDIT_POS_TUDO.sql
--   3) So entao (opcional reexecutar): 20260930183000_hb_credit_authorize_cap_and_intent_idempotency.sql
