-- Termo de uso Conta Coop — aceite único por mercado parceiro.

alter table public.hb_credit_partners
  add column if not exists partner_terms_version text,
  add column if not exists partner_terms_accepted_at timestamptz,
  add column if not exists partner_terms_accepted_by text,
  add column if not exists partner_terms_discount_snapshot numeric(5, 2);

create index if not exists hb_credit_partners_terms_idx
  on public.hb_credit_partners (cooperative_cnpj, partner_terms_accepted_at);
