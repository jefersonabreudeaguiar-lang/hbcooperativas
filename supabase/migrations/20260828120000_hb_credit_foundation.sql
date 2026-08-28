-- HB Credit Engine — Fase 0: fundação aditiva (domínio isolado)
-- NÃO altera Ficha Corrida, entregas, notas, app_users ou autenticação existente.

-- ---------------------------------------------------------------------------
-- 6.2 Teto global da cooperativa
-- Índice: PK em cooperative_cnpj — lookup por cooperativa (liberação de limites)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_cooperative_caps (
  cooperative_cnpj text primary key check (char_length(cooperative_cnpj) = 14),
  global_credit_cap_cents bigint not null default 0 check (global_credit_cap_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------------
-- 6.1 Conta de crédito (Conta Coop)
-- Índices: cooperativa + cooperado (consulta de saldo); status (bloqueios futuros)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  cooperado_id text not null,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'suspended')),
  limit_released_cents bigint not null default 0 check (limit_released_cents >= 0),
  amount_used_cents bigint not null default 0 check (amount_used_cents >= 0),
  available_cents bigint generated always as (limit_released_cents - amount_used_cents) stored,
  currency text not null default 'BRL' check (currency = 'BRL'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hb_credit_accounts_coop_cooperado_unique unique (cooperative_cnpj, cooperado_id),
  constraint hb_credit_accounts_used_lte_limit check (amount_used_cents <= limit_released_cents)
);

create index if not exists hb_credit_accounts_coop_cooperado_idx
  on public.hb_credit_accounts (cooperative_cnpj, cooperado_id);

create index if not exists hb_credit_accounts_coop_status_idx
  on public.hb_credit_accounts (cooperative_cnpj, status);

-- ---------------------------------------------------------------------------
-- 6.3 Parceiro / mercado
-- Índice: cooperativa + status (aprovações pendentes)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_partners (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_cnpj text not null check (char_length(partner_cnpj) = 14),
  name text not null,
  email text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hb_credit_partners_coop_cnpj_unique unique (cooperative_cnpj, partner_cnpj)
);

create index if not exists hb_credit_partners_coop_status_idx
  on public.hb_credit_partners (cooperative_cnpj, status);

create index if not exists hb_credit_partners_coop_idx
  on public.hb_credit_partners (cooperative_cnpj);

-- ---------------------------------------------------------------------------
-- 6.4 Payment Intent
-- Índices: partner+status; cooperative+created_at (expiração/consulta)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_payment_intents (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_id text not null references public.hb_credit_partners(id),
  cooperado_id text,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  description text,
  status text not null default 'CREATED'
    check (status in (
      'CREATED', 'PENDING', 'AUTHORIZING', 'CONFIRMED', 'DECLINED',
      'EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'
    )),
  nonce text not null,
  expires_at timestamptz not null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists hb_credit_payment_intents_partner_status_idx
  on public.hb_credit_payment_intents (partner_id, status);

create index if not exists hb_credit_payment_intents_coop_created_idx
  on public.hb_credit_payment_intents (cooperative_cnpj, created_at desc);

create unique index if not exists hb_credit_payment_intents_idempotency_idx
  on public.hb_credit_payment_intents (cooperative_cnpj, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 6.5 Transação financeira
-- Índice: cooperative + created_at; idempotency única por cooperativa
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_transactions (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  account_id uuid references public.hb_credit_accounts(id),
  payment_intent_id text unique references public.hb_credit_payment_intents(id),
  partner_id text references public.hb_credit_partners(id),
  cooperado_id text,
  event_type text not null check (event_type in (
    'LIMIT_RELEASE', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE'
  )),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'posted'
    check (status in ('pending', 'posted', 'reversed', 'failed')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint hb_credit_transactions_idempotency_unique unique (cooperative_cnpj, idempotency_key)
);

create index if not exists hb_credit_transactions_coop_created_idx
  on public.hb_credit_transactions (cooperative_cnpj, created_at desc);

create index if not exists hb_credit_transactions_account_idx
  on public.hb_credit_transactions (account_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6.6 Ledger append-only
-- Índice: account + created_at (extrato); transaction_id (auditoria)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  account_id uuid not null references public.hb_credit_accounts(id),
  transaction_id text not null references public.hb_credit_transactions(id),
  entry_type text not null,
  amount_cents bigint not null check (amount_cents <> 0),
  direction text not null check (direction in ('debit', 'credit')),
  balance_reference_cents bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hb_credit_ledger_account_created_idx
  on public.hb_credit_ledger_entries (account_id, created_at desc);

create index if not exists hb_credit_ledger_transaction_idx
  on public.hb_credit_ledger_entries (transaction_id);

create index if not exists hb_credit_ledger_coop_created_idx
  on public.hb_credit_ledger_entries (cooperative_cnpj, created_at desc);

-- ---------------------------------------------------------------------------
-- 6.7 Recebível do mercado
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_receivables (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_id text not null references public.hb_credit_partners(id),
  transaction_id text not null unique references public.hb_credit_transactions(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'ELIGIBLE', 'PROCESSING', 'SETTLED', 'BLOCKED_FOR_REVIEW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hb_credit_receivables_partner_status_idx
  on public.hb_credit_receivables (partner_id, status);

-- ---------------------------------------------------------------------------
-- 6.8 Estorno (identidade própria, vínculo ao pagamento original)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_refunds (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  original_transaction_id text not null references public.hb_credit_transactions(id),
  refund_transaction_id text not null unique references public.hb_credit_transactions(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists hb_credit_refunds_original_idx
  on public.hb_credit_refunds (original_transaction_id);

-- ---------------------------------------------------------------------------
-- Parte 11 — Audit log financeiro
-- Índice: cooperative + created_at (trilha por cooperativa)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_audit_log (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  actor text,
  actor_role text,
  action text not null,
  resource_type text,
  resource_id text,
  correlation_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hb_credit_audit_coop_created_idx
  on public.hb_credit_audit_log (cooperative_cnpj, created_at desc);

create index if not exists hb_credit_audit_resource_idx
  on public.hb_credit_audit_log (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- Parte 13 — Idempotência persistida
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  scope text not null,
  idempotency_key text not null,
  result_reference_id text not null,
  created_at timestamptz not null default now(),
  constraint hb_credit_idempotency_unique unique (cooperative_cnpj, scope, idempotency_key)
);

create index if not exists hb_credit_idempotency_coop_scope_idx
  on public.hb_credit_idempotency_records (cooperative_cnpj, scope, created_at desc);

-- ---------------------------------------------------------------------------
-- Parte 8 — RLS: DENY BY DEFAULT (somente service_role via API server-side)
-- ---------------------------------------------------------------------------
alter table public.hb_credit_cooperative_caps enable row level security;
alter table public.hb_credit_accounts enable row level security;
alter table public.hb_credit_partners enable row level security;
alter table public.hb_credit_payment_intents enable row level security;
alter table public.hb_credit_transactions enable row level security;
alter table public.hb_credit_ledger_entries enable row level security;
alter table public.hb_credit_receivables enable row level security;
alter table public.hb_credit_refunds enable row level security;
alter table public.hb_credit_audit_log enable row level security;
alter table public.hb_credit_idempotency_records enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'hb_credit_cooperative_caps','hb_credit_accounts','hb_credit_partners',
    'hb_credit_payment_intents','hb_credit_transactions','hb_credit_ledger_entries',
    'hb_credit_receivables','hb_credit_refunds','hb_credit_audit_log',
    'hb_credit_idempotency_records'
  ] loop
    execute format('drop policy if exists %I_service_role on public.%I', t, t);
    execute format(
      'create policy %I_service_role on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Ledger: revogar UPDATE/DELETE para roles não-superuser (append-only na aplicação)
revoke update, delete on public.hb_credit_ledger_entries from authenticated, anon;
