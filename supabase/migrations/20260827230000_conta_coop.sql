-- Conta Coop / HB Credit Engine — módulo financeiro isolado da Ficha Corrida
-- Fonte de verdade: Supabase (servidor). Apps são clientes.

-- Estende papéis de usuário
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro'));

alter table public.app_users add column if not exists parceiro_id text;
create index if not exists app_users_parceiro_idx on public.app_users (parceiro_id);

-- Teto global obrigatório por cooperativa
create table if not exists public.conta_coop_teto (
  cooperativa_cnpj text primary key,
  teto_centavos bigint not null default 0 check (teto_centavos >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Limites por cooperado (regra dos três valores)
create table if not exists public.conta_coop_limites (
  id uuid primary key default gen_random_uuid(),
  cooperativa_cnpj text not null,
  cooperado_id text not null,
  limite_liberado_centavos bigint not null default 0 check (limite_liberado_centavos >= 0),
  valor_usado_centavos bigint not null default 0 check (valor_usado_centavos >= 0),
  bloqueado boolean not null default false,
  pin_hash text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint conta_coop_limites_unique unique (cooperativa_cnpj, cooperado_id),
  constraint conta_coop_limites_usado_lte_limite check (valor_usado_centavos <= limite_liberado_centavos)
);

create index if not exists conta_coop_limites_coop_idx on public.conta_coop_limites (cooperativa_cnpj);

-- Parceiros / mercados
create table if not exists public.conta_coop_parceiros (
  id text primary key,
  cooperativa_cnpj text not null,
  cnpj_mercado text not null,
  nome_mercado text not null,
  email text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'ativo', 'bloqueado')),
  app_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conta_coop_parceiros_cnpj_unique unique (cooperativa_cnpj, cnpj_mercado)
);

create index if not exists conta_coop_parceiros_coop_status_idx
  on public.conta_coop_parceiros (cooperativa_cnpj, status);

-- Payment intents
create table if not exists public.conta_coop_intents (
  id text primary key,
  cooperativa_cnpj text not null,
  parceiro_id text not null references public.conta_coop_parceiros(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  descricao text,
  status text not null default 'pendente'
    check (status in (
      'criada', 'pendente', 'em_autorizacao', 'confirmada',
      'expirada', 'cancelada', 'recusada',
      'estorno_pendente', 'estornada'
    )),
  nonce text not null,
  expires_at timestamptz not null,
  cooperado_id_alvo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists conta_coop_intents_parceiro_idx on public.conta_coop_intents (parceiro_id, status);

-- Transações confirmadas
create table if not exists public.conta_coop_transacoes (
  id text primary key,
  intent_id text not null unique references public.conta_coop_intents(id),
  cooperativa_cnpj text not null,
  cooperado_id text not null,
  parceiro_id text not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  status text not null default 'confirmada'
    check (status in ('confirmada', 'estorno_pendente', 'estornada')),
  idempotency_key text not null,
  receipt_code text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists conta_coop_transacoes_idempotency_idx
  on public.conta_coop_transacoes (cooperativa_cnpj, idempotency_key);

-- Recebíveis do mercado
create table if not exists public.conta_coop_recebiveis (
  id text primary key,
  transacao_id text not null unique references public.conta_coop_transacoes(id),
  parceiro_id text not null,
  cooperativa_cnpj text not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  status text not null default 'aberto'
    check (status in ('aberto', 'elegivel', 'em_processamento', 'liquidado', 'bloqueado_revisao', 'estornado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ledger imutável (append-only)
create table if not exists public.conta_coop_ledger (
  id uuid primary key default gen_random_uuid(),
  cooperativa_cnpj text not null,
  cooperado_id text,
  parceiro_id text,
  tipo text not null,
  amount_centavos bigint not null,
  saldo_disponivel_apos_centavos bigint,
  reference_type text,
  reference_id text,
  memo text,
  actor_user_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conta_coop_ledger_cooperado_idx
  on public.conta_coop_ledger (cooperativa_cnpj, cooperado_id, created_at desc);

-- Auditoria Conta Coop
create table if not exists public.conta_coop_audit (
  id uuid primary key default gen_random_uuid(),
  cooperativa_cnpj text not null,
  action text not null,
  actor_user_id text,
  actor_role text,
  entity_type text,
  entity_id text,
  estado_anterior jsonb,
  estado_novo jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conta_coop_audit_coop_idx on public.conta_coop_audit (cooperativa_cnpj, created_at desc);

-- RLS: somente service_role (API Next.js)
alter table public.conta_coop_teto enable row level security;
alter table public.conta_coop_limites enable row level security;
alter table public.conta_coop_parceiros enable row level security;
alter table public.conta_coop_intents enable row level security;
alter table public.conta_coop_transacoes enable row level security;
alter table public.conta_coop_recebiveis enable row level security;
alter table public.conta_coop_ledger enable row level security;
alter table public.conta_coop_audit enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'conta_coop_teto','conta_coop_limites','conta_coop_parceiros','conta_coop_intents',
    'conta_coop_transacoes','conta_coop_recebiveis','conta_coop_ledger','conta_coop_audit'
  ] loop
    execute format('drop policy if exists %I_service on public.%I', t, t);
    execute format(
      'create policy %I_service on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Autorização atômica de pagamento (anti double-spend)
create or replace function public.conta_coop_authorize_payment(
  p_intent_id text,
  p_nonce text,
  p_cooperado_id text,
  p_cooperativa_cnpj text,
  p_idempotency_key text,
  p_transacao_id text,
  p_recebivel_id text,
  p_receipt_code text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_intent public.conta_coop_intents%rowtype;
  v_limite public.conta_coop_limites%rowtype;
  v_parceiro public.conta_coop_parceiros%rowtype;
  v_existing public.conta_coop_transacoes%rowtype;
  v_disponivel bigint;
  v_teto bigint;
  v_distribuido bigint;
begin
  select * into v_existing
  from public.conta_coop_transacoes
  where cooperativa_cnpj = p_cooperativa_cnpj and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'transacao_id', v_existing.id);
  end if;

  select * into v_intent from public.conta_coop_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cobrança não encontrada.');
  end if;

  if v_intent.cooperativa_cnpj <> p_cooperativa_cnpj then
    return jsonb_build_object('ok', false, 'error', 'Cooperativa inválida.');
  end if;

  if v_intent.nonce <> p_nonce then
    return jsonb_build_object('ok', false, 'error', 'QR inválido.');
  end if;

  if v_intent.status not in ('pendente', 'criada') then
    return jsonb_build_object('ok', false, 'error', 'Cobrança já utilizada ou encerrada.');
  end if;

  if v_intent.expires_at < now() then
    update public.conta_coop_intents set status = 'expirada', updated_at = now() where id = p_intent_id;
    return jsonb_build_object('ok', false, 'error', 'Cobrança expirada.');
  end if;

  select * into v_parceiro from public.conta_coop_parceiros where id = v_intent.parceiro_id;
  if v_parceiro.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'error', 'Mercado não autorizado.');
  end if;

  select * into v_limite from public.conta_coop_limites
  where cooperativa_cnpj = p_cooperativa_cnpj and cooperado_id = p_cooperado_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cooperado sem limite Conta Coop.');
  end if;

  if v_limite.bloqueado then
    return jsonb_build_object('ok', false, 'error', 'Cooperado bloqueado para pagamentos.');
  end if;

  v_disponivel := v_limite.limite_liberado_centavos - v_limite.valor_usado_centavos;
  if v_disponivel < v_intent.amount_centavos then
    return jsonb_build_object('ok', false, 'error', 'Limite insuficiente.');
  end if;

  update public.conta_coop_limites
  set valor_usado_centavos = valor_usado_centavos + v_intent.amount_centavos,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_limite.id;

  v_disponivel := v_disponivel - v_intent.amount_centavos;

  update public.conta_coop_intents
  set status = 'confirmada', updated_at = now(), consumed_at = now()
  where id = p_intent_id;

  insert into public.conta_coop_transacoes (
    id, intent_id, cooperativa_cnpj, cooperado_id, parceiro_id,
    amount_centavos, status, idempotency_key, receipt_code
  ) values (
    p_transacao_id, p_intent_id, p_cooperativa_cnpj, p_cooperado_id, v_intent.parceiro_id,
    v_intent.amount_centavos, 'confirmada', p_idempotency_key, p_receipt_code
  );

  insert into public.conta_coop_recebiveis (
    id, transacao_id, parceiro_id, cooperativa_cnpj, amount_centavos, status
  ) values (
    p_recebivel_id, p_transacao_id, v_intent.parceiro_id, p_cooperativa_cnpj,
    v_intent.amount_centavos, 'aberto'
  );

  insert into public.conta_coop_ledger (
    cooperativa_cnpj, cooperado_id, parceiro_id, tipo, amount_centavos,
    saldo_disponivel_apos_centavos, reference_type, reference_id, memo, actor_user_id
  ) values (
    p_cooperativa_cnpj, p_cooperado_id, v_intent.parceiro_id, 'PAYMENT', -v_intent.amount_centavos,
    v_disponivel, 'payment', p_transacao_id,
    coalesce(v_intent.descricao, 'Pagamento Conta Coop'), p_actor_user_id
  );

  insert into public.conta_coop_audit (
    cooperativa_cnpj, action, actor_user_id, entity_type, entity_id, estado_novo
  ) values (
    p_cooperativa_cnpj, 'payment.authorized', p_actor_user_id, 'transacao', p_transacao_id,
    jsonb_build_object('amount_centavos', v_intent.amount_centavos, 'cooperado_id', p_cooperado_id)
  );

  return jsonb_build_object(
    'ok', true,
    'transacao_id', p_transacao_id,
    'disponivel_apos_centavos', v_disponivel,
    'amount_centavos', v_intent.amount_centavos
  );
end;
$$;

-- Estorno atômico (novo evento — nunca apaga histórico)
create or replace function public.conta_coop_refund_payment(
  p_transacao_id text,
  p_cooperativa_cnpj text,
  p_refund_ledger_id uuid,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_tx public.conta_coop_transacoes%rowtype;
  v_limite public.conta_coop_limites%rowtype;
  v_disponivel bigint;
begin
  select * into v_tx from public.conta_coop_transacoes
  where id = p_transacao_id and cooperativa_cnpj = p_cooperativa_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Transação não encontrada.');
  end if;

  if v_tx.status <> 'confirmada' then
    return jsonb_build_object('ok', false, 'error', 'Transação não pode ser estornada.');
  end if;

  select * into v_limite from public.conta_coop_limites
  where cooperativa_cnpj = p_cooperativa_cnpj and cooperado_id = v_tx.cooperado_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Limite do cooperado não encontrado.');
  end if;

  update public.conta_coop_limites
  set valor_usado_centavos = greatest(0, valor_usado_centavos - v_tx.amount_centavos),
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_limite.id;

  v_disponivel := v_limite.limite_liberado_centavos - greatest(0, v_limite.valor_usado_centavos - v_tx.amount_centavos);

  update public.conta_coop_transacoes
  set status = 'estornada'
  where id = p_transacao_id;

  update public.conta_coop_intents
  set status = 'estornada', updated_at = now()
  where id = v_tx.intent_id;

  update public.conta_coop_recebiveis
  set status = 'estornado', updated_at = now()
  where transacao_id = p_transacao_id;

  insert into public.conta_coop_ledger (
    id, cooperativa_cnpj, cooperado_id, parceiro_id, tipo, amount_centavos,
    saldo_disponivel_apos_centavos, reference_type, reference_id, memo, actor_user_id
  ) values (
    p_refund_ledger_id, p_cooperativa_cnpj, v_tx.cooperado_id, v_tx.parceiro_id, 'REFUND', v_tx.amount_centavos,
    v_disponivel, 'refund', p_transacao_id, 'Estorno Conta Coop', p_actor_user_id
  );

  insert into public.conta_coop_audit (
    cooperativa_cnpj, action, actor_user_id, entity_type, entity_id, estado_novo
  ) values (
    p_cooperativa_cnpj, 'payment.refunded', p_actor_user_id, 'transacao', p_transacao_id,
    jsonb_build_object('amount_centavos', v_tx.amount_centavos)
  );

  return jsonb_build_object('ok', true, 'transacao_id', p_transacao_id, 'disponivel_apos_centavos', v_disponivel);
end;
$$;
