-- Compatibilidade V1: tabelas e colunas aditivas; sem copiar dados reais.
-- Rotinas financeiras são validadas separadamente.
set local lock_timeout = '5s';
-- Desconto contratual por mercado, recebível líquido, pool 70/20/10 e cashback cooperado.

alter table public.hb_credit_partners
  add column if not exists partner_discount_percent numeric(5, 2) not null default 0
  check (partner_discount_percent >= 0 and partner_discount_percent <= 100);

alter table public.hb_credit_transactions
  add column if not exists gross_amount_cents bigint,
  add column if not exists partner_discount_percent numeric(5, 2),
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists net_receivable_cents bigint,
  add column if not exists credit_debited_cents bigint,
  add column if not exists cashback_applied_cents bigint not null default 0;

alter table public.hb_credit_receivables
  add column if not exists gross_amount_cents bigint,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists net_amount_cents bigint;

create table if not exists public.hb_credit_cashback_balances (
  cooperative_cnpj text not null,
  cooperado_id text not null,
  available_cents bigint not null default 0 check (available_cents >= 0),
  lifetime_earned_cents bigint not null default 0,
  lifetime_used_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cooperative_cnpj, cooperado_id)
);

create table if not exists public.hb_credit_discount_allocations (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null,
  transaction_id text not null unique references public.hb_credit_transactions (id) on delete cascade,
  cooperado_id text not null,
  partner_id text not null,
  mes_referencia text not null,
  gross_cents bigint not null,
  discount_cents bigint not null,
  net_partner_cents bigint not null,
  cashback_cents bigint not null default 0,
  app_cents bigint not null default 0,
  coop_cents bigint not null default 0,
  cashback_status text not null default 'EARNED',
  app_pool_status text not null default 'PENDING',
  coop_pool_status text not null default 'PENDING',
  settlement_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hb_discount_alloc_coop_mes
  on public.hb_credit_discount_allocations (cooperative_cnpj, mes_referencia);


-- Termo de uso Conta Coop — aceite único por mercado parceiro.

alter table public.hb_credit_partners
  add column if not exists partner_terms_version text,
  add column if not exists partner_terms_accepted_at timestamptz,
  add column if not exists partner_terms_accepted_by text,
  add column if not exists partner_terms_discount_snapshot numeric(5, 2);

create index if not exists hb_credit_partners_terms_idx
  on public.hb_credit_partners (cooperative_cnpj, partner_terms_accepted_at);

-- Repasse mensal dos 20% do desconto Conta Coop à plataforma HB (PIX + livro caixa).

alter table public.hb_credit_discount_allocations
  add column if not exists app_repasse_id text null;

create index if not exists idx_hb_discount_alloc_app_repasse
  on public.hb_credit_discount_allocations (cooperative_cnpj, mes_referencia, app_repasse_id);

create table if not exists public.hb_credit_app_repasse (
  id text primary key,
  cooperative_cnpj text not null,
  mes_referencia text not null,
  amount_cents bigint not null check (amount_cents > 0),
  responsavel_user_id text not null,
  responsavel_nome text not null,
  comprovante_memo text null,
  livro_caixa_origem_id text not null unique,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (cooperative_cnpj, mes_referencia)
);

create index if not exists idx_hb_app_repasse_coop_mes
  on public.hb_credit_app_repasse (cooperative_cnpj, mes_referencia);


-- Cobrança SaaS HB na nuvem — enforcement server-side (Fase 1)
alter table public.cooperativas
  add column if not exists cobranca_saas jsonb;

comment on column public.cooperativas.cobranca_saas is
  'Status de assinatura HB (bloqueio inadimplência) — fonte da verdade para APIs.';

-- Tokens de recuperação de senha (cooperados)
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_hash_idx on public.password_reset_tokens (token_hash);
create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens (user_id);
create index if not exists password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

drop policy if exists password_reset_tokens_service_only on public.password_reset_tokens;
create policy password_reset_tokens_service_only on public.password_reset_tokens
  for all
  to service_role
  using (true)
  with check (true);

-- Configurações globais da plataforma HB (cobrança SaaS, etc.)

create table if not exists public.hb_platform_settings (
  id text primary key default 'default',
  cobranca_saas jsonb not null default '{"precoCooperado": 9.9, "minimoMes": 149}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.hb_platform_settings (id)
values ('default')
on conflict (id) do nothing;

comment on table public.hb_platform_settings is
  'Parâmetros globais da plataforma HB — editados pelo painel /admin.';

comment on column public.hb_platform_settings.cobranca_saas is
  'Mensalidade HB: precoCooperado (R$/cooperado/mês) e minimoMes (piso por cooperativa).';

alter table public.hb_platform_settings enable row level security;

-- Cobranças unificadas HB (mensalidade SaaS + repasse Conta Coop) via Asaas.

create table if not exists public.hb_asaas_customers (
  cooperative_cnpj text primary key check (char_length(cooperative_cnpj) = 14),
  asaas_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hb_asaas_charges (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  charge_key text not null,
  periodo_saas_id text,
  mes_referencia_conta_coop text not null,
  saas_cooperados_count integer not null default 0,
  saas_subtotal_cents bigint not null default 0,
  repasse_alloc_count integer not null default 0,
  repasse_subtotal_cents bigint not null default 0,
  total_cents bigint not null,
  breakdown jsonb not null,
  asaas_payment_id text,
  asaas_invoice_url text,
  pix_payload text,
  pix_qr_base64 text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'received', 'confirmed', 'cancelled', 'expired')),
  saas_confirmed_at timestamptz,
  repasse_confirmed_at timestamptz,
  paid_at timestamptz,
  created_by_user_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hb_asaas_charges_key_unique unique (charge_key)
);

create index if not exists hb_asaas_charges_cnpj_status_idx
  on public.hb_asaas_charges (cooperative_cnpj, status, created_at desc);

create index if not exists hb_asaas_charges_asaas_payment_idx
  on public.hb_asaas_charges (asaas_payment_id)
  where asaas_payment_id is not null;

create table if not exists public.hb_asaas_webhook_events (
  id text primary key,
  event_type text not null,
  asaas_payment_id text,
  charge_id uuid references public.hb_asaas_charges(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.hb_asaas_customers enable row level security;
alter table public.hb_asaas_charges enable row level security;
alter table public.hb_asaas_webhook_events enable row level security;

comment on table public.hb_asaas_charges is
  'Cobrança unificada HB: mensalidade por cooperado + repasse 30% Conta Coop (valores reais da nuvem).';

-- Comprovante PIX anexado pela cooperativa na liquidação do mercado

alter table public.hb_credit_settlements
  add column if not exists comprovante_storage_path text;

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

-- Transferência HB entre cooperados (QR Receber) — domínio isolado do mercado parceiro.

create table if not exists public.hb_credit_cooperado_transfer_intents (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  receiver_cooperado_id text not null,
  payer_cooperado_id text,
  amount_cents bigint not null check (amount_cents > 0),
  description text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  nonce text not null,
  expires_at timestamptz not null,
  idempotency_key text,
  receipt_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists hb_credit_coop_transfer_receiver_status_idx
  on public.hb_credit_cooperado_transfer_intents (cooperative_cnpj, receiver_cooperado_id, status);

create unique index if not exists hb_credit_coop_transfer_idempotency_idx
  on public.hb_credit_cooperado_transfer_intents (cooperative_cnpj, idempotency_key)
  where idempotency_key is not null;

alter table public.hb_credit_cooperado_transfer_intents enable row level security;


alter table public.app_users add column if not exists totp_secret_encrypted text, add column if not exists totp_enabled_at timestamptz;
alter table public.hb_credit_cooperative_caps add column if not exists cooperativa_liberacao_percent numeric(5,2) check (cooperativa_liberacao_percent >= 0 and cooperativa_liberacao_percent <= 100);
alter table public.hb_credit_cashback_balances enable row level security;
revoke all on table public.hb_credit_cashback_balances from public, anon, authenticated;
grant all on table public.hb_credit_cashback_balances to service_role;
alter table public.hb_credit_discount_allocations enable row level security;
revoke all on table public.hb_credit_discount_allocations from public, anon, authenticated;
grant all on table public.hb_credit_discount_allocations to service_role;
alter table public.hb_credit_app_repasse enable row level security;
revoke all on table public.hb_credit_app_repasse from public, anon, authenticated;
grant all on table public.hb_credit_app_repasse to service_role;
alter table public.password_reset_tokens enable row level security;
revoke all on table public.password_reset_tokens from public, anon, authenticated;
grant all on table public.password_reset_tokens to service_role;
alter table public.hb_platform_settings enable row level security;
revoke all on table public.hb_platform_settings from public, anon, authenticated;
grant all on table public.hb_platform_settings to service_role;
alter table public.hb_asaas_customers enable row level security;
revoke all on table public.hb_asaas_customers from public, anon, authenticated;
grant all on table public.hb_asaas_customers to service_role;
alter table public.hb_asaas_charges enable row level security;
revoke all on table public.hb_asaas_charges from public, anon, authenticated;
grant all on table public.hb_asaas_charges to service_role;
alter table public.hb_asaas_webhook_events enable row level security;
revoke all on table public.hb_asaas_webhook_events from public, anon, authenticated;
grant all on table public.hb_asaas_webhook_events to service_role;
alter table public.hb_credit_partner_pix_change_requests enable row level security;
revoke all on table public.hb_credit_partner_pix_change_requests from public, anon, authenticated;
grant all on table public.hb_credit_partner_pix_change_requests to service_role;
alter table public.hb_credit_cooperado_transfer_intents enable row level security;
revoke all on table public.hb_credit_cooperado_transfer_intents from public, anon, authenticated;
grant all on table public.hb_credit_cooperado_transfer_intents to service_role;