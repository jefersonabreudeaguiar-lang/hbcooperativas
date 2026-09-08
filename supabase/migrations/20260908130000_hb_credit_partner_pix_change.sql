-- Solicitações de mudança de PIX do mercado parceiro (aprovação da cooperativa)

create table if not exists public.hb_credit_partner_pix_change_requests (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_id text not null references public.hb_credit_partners(id),
  motivo text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'CONSUMED')),
  requested_by_user_id text,
  reviewed_by_user_id text,
  reviewed_by_name text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists hb_credit_partner_pix_change_coop_status_idx
  on public.hb_credit_partner_pix_change_requests (cooperative_cnpj, status, created_at desc);

create index if not exists hb_credit_partner_pix_change_partner_idx
  on public.hb_credit_partner_pix_change_requests (partner_id, created_at desc);

create unique index if not exists hb_credit_partner_pix_change_pending_partner_idx
  on public.hb_credit_partner_pix_change_requests (partner_id)
  where status = 'PENDING';

create unique index if not exists hb_credit_partner_pix_change_approved_partner_idx
  on public.hb_credit_partner_pix_change_requests (partner_id)
  where status = 'APPROVED';

alter table public.hb_credit_partner_pix_change_requests enable row level security;

drop policy if exists hb_credit_partner_pix_change_service_role on public.hb_credit_partner_pix_change_requests;
create policy hb_credit_partner_pix_change_service_role on public.hb_credit_partner_pix_change_requests
  for all to service_role using (true) with check (true);
