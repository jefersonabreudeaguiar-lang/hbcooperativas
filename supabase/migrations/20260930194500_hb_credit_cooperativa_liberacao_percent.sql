-- Percentual de liberação HB persistido (não precisa redigitar a cada sync).
alter table public.hb_credit_cooperative_caps
  add column if not exists cooperativa_liberacao_percent numeric(5, 2)
  check (cooperativa_liberacao_percent >= 0 and cooperativa_liberacao_percent <= 100);

update public.hb_credit_cooperative_caps
set cooperativa_liberacao_percent = global_credit_cap_percent
where cooperativa_liberacao_percent is null
  and global_credit_cap_percent is not null
  and global_credit_cap_percent > 0;
