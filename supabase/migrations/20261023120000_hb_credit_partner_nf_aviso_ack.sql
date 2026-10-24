-- Comunicado NF dispensada — aceite do mercado (não repetir a cada login).
alter table public.hb_credit_partners
  add column if not exists partner_nf_aviso_ack_version text,
  add column if not exists partner_nf_aviso_ack_at timestamptz,
  add column if not exists partner_nf_aviso_ack_by text;

create index if not exists hb_credit_partners_nf_aviso_ack_idx
  on public.hb_credit_partners (cooperative_cnpj, partner_nf_aviso_ack_version);
