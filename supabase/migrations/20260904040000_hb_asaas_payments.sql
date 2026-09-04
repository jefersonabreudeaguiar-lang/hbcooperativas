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
