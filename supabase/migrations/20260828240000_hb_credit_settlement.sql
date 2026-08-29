-- Liquidação de mercados parceiros + PIX do mercado

alter table public.hb_credit_partners
  add column if not exists pix_key text,
  add column if not exists pix_holder_name text,
  add column if not exists pix_updated_at timestamptz;

create table if not exists public.hb_credit_settlements (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_id text not null references public.hb_credit_partners(id),
  mes_referencia text not null check (mes_referencia ~ '^\d{4}-\d{2}$'),
  total_cents bigint not null check (total_cents >= 0),
  transacoes_count integer not null default 0 check (transacoes_count >= 0),
  status text not null default 'AWAITING_PARTNER'
    check (status in ('AWAITING_PARTNER', 'CONFIRMED', 'CANCELLED')),
  responsavel_user_id text,
  responsavel_nome text,
  pago_em timestamptz,
  comprovante_memo text,
  relatorio_html text,
  partner_assinatura_data_url text,
  partner_confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hb_credit_settlements_coop_partner_mes_idx
  on public.hb_credit_settlements (cooperative_cnpj, partner_id, mes_referencia desc);

create index if not exists hb_credit_settlements_partner_status_idx
  on public.hb_credit_settlements (partner_id, status);

alter table public.hb_credit_receivables
  add column if not exists settlement_id text references public.hb_credit_settlements(id);

create index if not exists hb_credit_receivables_settlement_idx
  on public.hb_credit_receivables (settlement_id)
  where settlement_id is not null;
