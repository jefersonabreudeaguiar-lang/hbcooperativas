-- Proteção contra tentativas repetidas de PIN financeiro
alter table public.hb_credit_accounts
  add column if not exists pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0);

alter table public.hb_credit_accounts
  add column if not exists pin_locked_until timestamptz;

alter table public.hb_credit_accounts
  add column if not exists pin_updated_at timestamptz;
