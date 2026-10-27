-- V2: valor bruto manual por cooperado (fonte do "a receber" e base do limite HB).

alter table public.hb_credit_accounts
  add column if not exists manual_valor_bruto_cents bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hb_credit_accounts_manual_valor_bruto_cents_check'
  ) then
    alter table public.hb_credit_accounts
      add constraint hb_credit_accounts_manual_valor_bruto_cents_check
      check (manual_valor_bruto_cents is null or manual_valor_bruto_cents >= 0);
  end if;
exception
  when duplicate_object then null;
end $$;

comment on column public.hb_credit_accounts.manual_valor_bruto_cents is
  'Valor bruto manual (centavos). Quando preenchido, substitui crédito-base da ficha para limite HB e valor a receber V2.';
