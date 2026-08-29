-- Teto global da cooperativa em percentual (sobre crédito total na ficha)
alter table public.hb_credit_cooperative_caps
  add column if not exists global_credit_cap_percent numeric(5, 2)
  check (global_credit_cap_percent >= 0 and global_credit_cap_percent <= 100);

-- Padrão: 100% do crédito na ficha
update public.hb_credit_cooperative_caps
set global_credit_cap_percent = 100
where global_credit_cap_percent is null;
