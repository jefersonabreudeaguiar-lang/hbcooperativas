-- Solicitações de estorno pelo mercado parceiro (aprovação da cooperativa)

create table if not exists public.hb_credit_refund_requests (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_id text not null references public.hb_credit_partners(id),
  transaction_id text not null references public.hb_credit_transactions(id),
  amount_cents bigint not null check (amount_cents > 0),
  motivo text not null check (char_length(trim(motivo)) >= 5),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
  requested_by_user_id text,
  reviewed_by_user_id text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists hb_credit_refund_requests_coop_status_idx
  on public.hb_credit_refund_requests (cooperative_cnpj, status, created_at desc);

create index if not exists hb_credit_refund_requests_partner_idx
  on public.hb_credit_refund_requests (partner_id, created_at desc);

create unique index if not exists hb_credit_refund_requests_pending_tx_idx
  on public.hb_credit_refund_requests (transaction_id)
  where status = 'PENDING';

alter table public.hb_credit_refund_requests enable row level security;

drop policy if exists hb_credit_refund_requests_service_role on public.hb_credit_refund_requests;
create policy hb_credit_refund_requests_service_role on public.hb_credit_refund_requests
  for all to service_role using (true) with check (true);
