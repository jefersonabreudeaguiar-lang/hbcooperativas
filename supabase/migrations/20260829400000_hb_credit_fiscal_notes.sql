-- Notas fiscais Conta Coop — anexo pelo mercado, conferência pelo responsável

create table if not exists public.hb_credit_fiscal_notes (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  transaction_id text not null unique references public.hb_credit_transactions(id) on delete cascade,
  receivable_id text references public.hb_credit_receivables(id) on delete set null,
  partner_id text not null references public.hb_credit_partners(id),
  cooperado_id text not null,
  cooperado_nome_snapshot text,
  mes_referencia text not null check (mes_referencia ~ '^\d{4}-\d{2}$'),
  sale_amount_cents bigint not null check (sale_amount_cents > 0),
  status text not null default 'PENDING_UPLOAD'
    check (status in ('PENDING_UPLOAD', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
  photo_storage_path text,
  nf_number text,
  nf_issued_to_name text,
  nf_date date,
  nf_amount_cents bigint check (nf_amount_cents is null or nf_amount_cents > 0),
  reject_reason text,
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hb_credit_fiscal_notes_coop_mes_idx
  on public.hb_credit_fiscal_notes (cooperative_cnpj, mes_referencia desc);

create index if not exists hb_credit_fiscal_notes_partner_mes_idx
  on public.hb_credit_fiscal_notes (partner_id, mes_referencia desc);

create index if not exists hb_credit_fiscal_notes_status_idx
  on public.hb_credit_fiscal_notes (cooperative_cnpj, status);

create index if not exists hb_credit_fiscal_notes_coop_status_mes_idx
  on public.hb_credit_fiscal_notes (cooperative_cnpj, mes_referencia, status);
