-- =============================================================================
-- HB CREDIT — SCRIPT UNICO (passos 1 a 8)
-- CoopeagriPla / Conta Coop — cole inteiro no Supabase SQL Editor e execute.
-- Idempotente: seguro reexecutar se algo ja existir (IF NOT EXISTS / OR REPLACE).
-- Tempo estimado: 1-3 minutos.
-- =============================================================================

-- =============================================================================
-- PASSO 1 — Base + pagamento QR + estorno direto (RPCs)
-- Fonte: supabase/migrations/APPLY_HB_CREDIT_COMPLETO.sql
-- =============================================================================

-- HB Credit Engine â€” Fase 0: fundaÃ§Ã£o aditiva (domÃ­nio isolado)
-- NÃƒO altera Ficha Corrida, entregas, notas, app_users ou autenticaÃ§Ã£o existente.

-- ---------------------------------------------------------------------------
-- 6.2 Teto global da cooperativa
-- Ãndice: PK em cooperative_cnpj â€” lookup por cooperativa (liberaÃ§Ã£o de limites)
-- ---------------------------------------------------------------------------
create table if not exists public.hb_credit_cooperative_caps (
  cooperative_cnpj text primary key check (char_length(cooperative_cnpj) = 14),
  global_credit_cap_cents bigint not null default 0 check (global_credit_cap_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------------
-- 6.1 Conta de crÃ©dito (Conta Coop)
-- Ãndices: cooperativa + cooperado (consulta de saldo); status (bloqueios futuros)
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
-- Ãndice: cooperativa + status (aprovaÃ§Ãµes pendentes)
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
-- Ãndices: partner+status; cooperative+created_at (expiraÃ§Ã£o/consulta)
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
-- 6.5 TransaÃ§Ã£o financeira
-- Ãndice: cooperative + created_at; idempotency Ãºnica por cooperativa
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
-- Ãndice: account + created_at (extrato); transaction_id (auditoria)
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
-- 6.7 RecebÃ­vel do mercado
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
-- 6.8 Estorno (identidade prÃ³pria, vÃ­nculo ao pagamento original)
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
-- Parte 11 â€” Audit log financeiro
-- Ãndice: cooperative + created_at (trilha por cooperativa)
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
-- Parte 13 â€” IdempotÃªncia persistida
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
-- Parte 8 â€” RLS: DENY BY DEFAULT (somente service_role via API server-side)
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

-- Ledger: revogar UPDATE/DELETE para roles nÃ£o-superuser (append-only na aplicaÃ§Ã£o)
revoke update, delete on public.hb_credit_ledger_entries from authenticated, anon;
-- HB Credit Engine â€” Fase operacional (aditiva sobre foundation)
-- RPC atÃ´mico, PIN, parceiro em app_users. NÃƒO altera Ficha Corrida.

-- PapÃ©is: parceiro/mercado (somente quando HB Credit homologado)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_users'
  ) then
    alter table public.app_users drop constraint if exists app_users_role_check;
    alter table public.app_users add constraint app_users_role_check
      check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro', 'contador'));
    alter table public.app_users add column if not exists parceiro_id text;
    create index if not exists app_users_parceiro_idx on public.app_users (parceiro_id);
  end if;
end $$;

-- ExtensÃµes operacionais
alter table public.hb_credit_accounts add column if not exists pin_hash text;
alter table public.hb_credit_accounts add column if not exists updated_by text;

alter table public.hb_credit_partners add column if not exists app_user_id text;
create index if not exists hb_credit_partners_app_user_idx on public.hb_credit_partners (app_user_id);

alter table public.hb_credit_transactions add column if not exists receipt_code text;

-- AutorizaÃ§Ã£o atÃ´mica (anti double-spend + idempotÃªncia)
create or replace function public.hb_credit_authorize_payment(
  p_intent_id text,
  p_nonce text,
  p_cooperado_id text,
  p_cooperative_cnpj text,
  p_idempotency_key text,
  p_transaction_id text,
  p_receivable_id text,
  p_receipt_code text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_intent public.hb_credit_payment_intents%rowtype;
  v_account public.hb_credit_accounts%rowtype;
  v_partner public.hb_credit_partners%rowtype;
  v_existing public.hb_credit_transactions%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
begin
  select * into v_existing from public.hb_credit_transactions
  where cooperative_cnpj = p_cooperative_cnpj and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'transacao_id', v_existing.id);
  end if;

  select * into v_intent from public.hb_credit_payment_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'CobranÃ§a nÃ£o encontrada.');
  end if;

  if v_intent.cooperative_cnpj <> p_cooperative_cnpj then
    return jsonb_build_object('ok', false, 'error', 'Cooperativa invÃ¡lida.');
  end if;

  if v_intent.nonce <> p_nonce then
    return jsonb_build_object('ok', false, 'error', 'QR invÃ¡lido.');
  end if;

  if v_intent.status not in ('PENDING', 'CREATED') then
    return jsonb_build_object('ok', false, 'error', 'CobranÃ§a jÃ¡ utilizada ou encerrada.');
  end if;

  if v_intent.expires_at < now() then
    update public.hb_credit_payment_intents set status = 'EXPIRED', updated_at = now() where id = p_intent_id;
    return jsonb_build_object('ok', false, 'error', 'CobranÃ§a expirada.');
  end if;

  select * into v_partner from public.hb_credit_partners where id = v_intent.partner_id;
  if v_partner.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'error', 'Mercado nÃ£o autorizado.');
  end if;

  select * into v_account from public.hb_credit_accounts
  where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = p_cooperado_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cooperado sem limite Conta Coop.');
  end if;

  if v_account.status = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'Cooperado bloqueado para pagamentos.');
  end if;

  v_disponivel := v_account.limit_released_cents - v_account.amount_used_cents;
  if v_disponivel < v_intent.amount_cents then
    return jsonb_build_object('ok', false, 'error', 'Limite insuficiente.');
  end if;

  update public.hb_credit_accounts
  set amount_used_cents = amount_used_cents + v_intent.amount_cents,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_disponivel - v_intent.amount_cents;

  update public.hb_credit_payment_intents
  set status = 'CONFIRMED', updated_at = now(), confirmed_at = now(), cooperado_id = p_cooperado_id
  where id = p_intent_id;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key, receipt_code
  ) values (
    p_transaction_id, p_cooperative_cnpj, v_account.id, p_intent_id, v_intent.partner_id, p_cooperado_id,
    'PAYMENT', v_intent.amount_cents, 'posted', p_idempotency_key, p_receipt_code
  );

  insert into public.hb_credit_receivables (
    id, cooperative_cnpj, partner_id, transaction_id, amount_cents, status
  ) values (
    p_receivable_id, p_cooperative_cnpj, v_intent.partner_id, p_transaction_id,
    v_intent.amount_cents, 'OPEN'
  );

  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'PAYMENT', v_intent.amount_cents,
    'debit', v_disponivel,
    jsonb_build_object('memo', coalesce(v_intent.description, 'Pagamento Conta Coop'))
  );

  insert into public.hb_credit_idempotency_records (
    cooperative_cnpj, scope, idempotency_key, result_reference_id
  ) values (
    p_cooperative_cnpj, 'payment_authorize', p_idempotency_key, p_transaction_id
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'PAYMENT_CONFIRMED', 'transaction', p_transaction_id,
    jsonb_build_object('amount_cents', v_intent.amount_cents, 'cooperado_id', p_cooperado_id)
  );

  return jsonb_build_object(
    'ok', true,
    'transacao_id', p_transaction_id,
    'disponivel_apos_centavos', v_disponivel,
    'amount_centavos', v_intent.amount_cents
  );
end;
$$;

create or replace function public.hb_credit_refund_payment(
  p_transaction_id text,
  p_cooperative_cnpj text,
  p_refund_transaction_id text,
  p_refund_id text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_tx public.hb_credit_transactions%rowtype;
  v_account public.hb_credit_accounts%rowtype;
  v_existing_refund public.hb_credit_refunds%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
begin
  select * into v_existing_refund from public.hb_credit_refunds
  where original_transaction_id = p_transaction_id
  limit 1;

  if found then
    select * into v_tx from public.hb_credit_transactions
    where id = p_transaction_id and cooperative_cnpj = p_cooperative_cnpj;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Transação não encontrada.');
    end if;

    select * into v_account from public.hb_credit_accounts where id = v_tx.account_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
    end if;

    v_disponivel := v_account.limit_released_cents - v_account.amount_used_cents;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transacao_id', p_transaction_id,
      'disponivel_apos_centavos', v_disponivel
    );
  end if;

  select * into v_tx from public.hb_credit_transactions
  where id = p_transaction_id and cooperative_cnpj = p_cooperative_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'TransaÃ§Ã£o nÃ£o encontrada.');
  end if;

  if v_tx.status <> 'posted' or v_tx.event_type <> 'PAYMENT' then
    return jsonb_build_object('ok', false, 'error', 'TransaÃ§Ã£o nÃ£o pode ser estornada.');
  end if;

  select * into v_account from public.hb_credit_accounts
  where id = v_tx.account_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Conta nÃ£o encontrada.');
  end if;

  update public.hb_credit_accounts
  set amount_used_cents = greatest(0, amount_used_cents - v_tx.amount_cents),
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_account.limit_released_cents - greatest(0, v_account.amount_used_cents - v_tx.amount_cents);

  update public.hb_credit_transactions set status = 'reversed' where id = p_transaction_id;

  update public.hb_credit_payment_intents
  set status = 'REFUNDED', updated_at = now()
  where id = v_tx.payment_intent_id;

  update public.hb_credit_receivables
  set status = 'BLOCKED_FOR_REVIEW', updated_at = now()
  where transaction_id = p_transaction_id;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key
  ) values (
    p_refund_transaction_id, p_cooperative_cnpj, v_account.id, null,
    v_tx.partner_id, v_tx.cooperado_id, 'REFUND', v_tx.amount_cents, 'posted',
    'refund:' || p_transaction_id
  );

  insert into public.hb_credit_refunds (
    id, cooperative_cnpj, original_transaction_id, refund_transaction_id, amount_cents, status
  ) values (
    p_refund_id, p_cooperative_cnpj, p_transaction_id, p_refund_transaction_id,
    v_tx.amount_cents, 'posted'
  );

  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_refund_transaction_id, 'REFUND', v_tx.amount_cents,
    'credit', v_disponivel, jsonb_build_object(
      'memo', 'Estorno Conta Coop',
      'original_transaction_id', p_transaction_id,
      'payment_intent_id', v_tx.payment_intent_id
    )
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'REFUND_CREATED', 'transaction', p_refund_transaction_id,
    jsonb_build_object('original_transaction_id', p_transaction_id, 'amount_cents', v_tx.amount_cents)
  );

  return jsonb_build_object('ok', true, 'transacao_id', p_transaction_id, 'disponivel_apos_centavos', v_disponivel);
end;
$$;

-- =============================================================================
-- PASSO 2 — Mercados parceiros (role parceiro, PIX, app_user_id)
-- Fonte: supabase/migrations/APPLY_HB_CREDIT_PARTNERS.sql
-- =============================================================================

-- HB Credit — schema mínimo de mercados parceiros (auto-repair via API admin)
-- Idempotente: seguro reexecutar no SQL Editor.

-- Papéis: parceiro/mercado
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_users'
  ) then
    alter table public.app_users drop constraint if exists app_users_role_check;
    alter table public.app_users add constraint app_users_role_check
      check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro', 'contador'));
    alter table public.app_users add column if not exists parceiro_id text;
    create index if not exists app_users_parceiro_idx on public.app_users (parceiro_id);
  end if;
end $$;

-- Tabela de parceiros (caso foundation ainda não aplicada)
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

alter table public.hb_credit_partners add column if not exists app_user_id text;
create index if not exists hb_credit_partners_app_user_idx on public.hb_credit_partners (app_user_id);

alter table public.hb_credit_partners add column if not exists pix_key text;
alter table public.hb_credit_partners add column if not exists pix_holder_name text;

-- =============================================================================
-- PASSO 3 — P0: teto percentual + protecao PIN cooperado
-- =============================================================================

alter table public.hb_credit_cooperative_caps
  add column if not exists global_credit_cap_percent numeric(5, 2)
  check (global_credit_cap_percent >= 0 and global_credit_cap_percent <= 100);

update public.hb_credit_cooperative_caps
set global_credit_cap_percent = 100
where global_credit_cap_percent is null;

alter table public.hb_credit_accounts
  add column if not exists pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0);

alter table public.hb_credit_accounts
  add column if not exists pin_locked_until timestamptz;

alter table public.hb_credit_accounts
  add column if not exists pin_updated_at timestamptz;

-- =============================================================================
-- PASSO 4 — Liquidacao PIX mercado
-- Fonte: supabase/migrations/20260828240000_hb_credit_settlement.sql
-- =============================================================================

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

-- =============================================================================
-- PASSO 5 — Solicitacoes de estorno pelo mercado
-- Fonte: supabase/migrations/20260829200000_hb_credit_refund_requests.sql
-- =============================================================================

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

-- =============================================================================
-- PASSO 6 — PIN financeiro do mercado
-- Fonte: supabase/migrations/20260829210000_hb_credit_partner_pin.sql
-- =============================================================================

-- PIN financeiro do mercado parceiro (solicitação de estorno)

alter table public.hb_credit_partners
  add column if not exists pin_hash text;

alter table public.hb_credit_partners
  add column if not exists pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0);

alter table public.hb_credit_partners
  add column if not exists pin_locked_until timestamptz;

alter table public.hb_credit_partners
  add column if not exists pin_updated_at timestamptz;

-- =============================================================================
-- PASSO 7 — Aprovar estorno atomico + RLS settlements
-- Fonte: supabase/migrations/20260829300000_hb_credit_phase1_security.sql
-- =============================================================================

-- Fase 1 segurança Conta Coop: RLS settlements + aprovação atômica de estorno

alter table public.hb_credit_settlements enable row level security;

drop policy if exists hb_credit_settlements_service_role on public.hb_credit_settlements;
create policy hb_credit_settlements_service_role on public.hb_credit_settlements
  for all to service_role using (true) with check (true);

create or replace function public.hb_credit_approve_refund_request(
  p_request_id text,
  p_cooperative_cnpj text,
  p_reviewer_user_id text,
  p_review_note text,
  p_refund_transaction_id text,
  p_refund_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_req public.hb_credit_refund_requests%rowtype;
  v_refund jsonb;
begin
  select * into v_req from public.hb_credit_refund_requests
  where id = p_request_id and cooperative_cnpj = p_cooperative_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Solicitação não encontrada.');
  end if;

  if v_req.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'error', 'Solicitação já foi analisada.');
  end if;

  v_refund := public.hb_credit_refund_payment(
    v_req.transaction_id,
    p_cooperative_cnpj,
    p_refund_transaction_id,
    p_refund_id,
    p_reviewer_user_id
  );

  if not coalesce((v_refund->>'ok')::boolean, false) then
    return v_refund;
  end if;

  update public.hb_credit_refund_requests
  set status = 'APPROVED',
      reviewed_by_user_id = p_reviewer_user_id,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'disponivel_apos_centavos', (v_refund->>'disponivel_apos_centavos')::bigint
  );
end;
$$;

-- =============================================================================
-- PASSO 8 — Notas fiscais (conferencia antes da liquidacao)
-- Fonte: supabase/migrations/20260829400000_hb_credit_fiscal_notes.sql
-- =============================================================================

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

-- =============================================================================
-- VERIFICACAO FINAL (opcional)
-- =============================================================================

select 'hb_credit_authorize_payment' as check_name, exists(
  select 1 from pg_proc where proname = 'hb_credit_authorize_payment'
) as ok
union all
select 'hb_credit_refund_payment', exists(
  select 1 from pg_proc where proname = 'hb_credit_refund_payment'
)
union all
select 'hb_credit_approve_refund_request', exists(
  select 1 from pg_proc where proname = 'hb_credit_approve_refund_request'
)
union all
select 'hb_credit_settlements', exists(
  select 1 from information_schema.tables
  where table_schema='public' and table_name='hb_credit_settlements'
)
union all
select 'hb_credit_refund_requests', exists(
  select 1 from information_schema.tables
  where table_schema='public' and table_name='hb_credit_refund_requests'
)
union all
select 'hb_credit_fiscal_notes', exists(
  select 1 from information_schema.tables
  where table_schema='public' and table_name='hb_credit_fiscal_notes'
);
