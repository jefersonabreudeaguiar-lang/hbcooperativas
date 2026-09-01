-- HB Credit Engine — Fase operacional (aditiva sobre foundation)
-- RPC atômico, PIN, parceiro em app_users. NÃO altera Ficha Corrida.

-- Papéis: parceiro/mercado (somente quando HB Credit homologado)
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

-- Extensões operacionais
alter table public.hb_credit_accounts add column if not exists pin_hash text;
alter table public.hb_credit_accounts add column if not exists updated_by text;

alter table public.hb_credit_partners add column if not exists app_user_id text;
create index if not exists hb_credit_partners_app_user_idx on public.hb_credit_partners (app_user_id);

alter table public.hb_credit_transactions add column if not exists receipt_code text;

-- Autorização atômica (anti double-spend + idempotência)
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
    return jsonb_build_object('ok', false, 'error', 'Cobrança não encontrada.');
  end if;

  if v_intent.cooperative_cnpj <> p_cooperative_cnpj then
    return jsonb_build_object('ok', false, 'error', 'Cooperativa inválida.');
  end if;

  if v_intent.nonce <> p_nonce then
    return jsonb_build_object('ok', false, 'error', 'QR inválido.');
  end if;

  if v_intent.status not in ('PENDING', 'CREATED') then
    return jsonb_build_object('ok', false, 'error', 'Cobrança já utilizada ou encerrada.');
  end if;

  if v_intent.expires_at < now() then
    update public.hb_credit_payment_intents set status = 'EXPIRED', updated_at = now() where id = p_intent_id;
    return jsonb_build_object('ok', false, 'error', 'Cobrança expirada.');
  end if;

  select * into v_partner from public.hb_credit_partners where id = v_intent.partner_id;
  if v_partner.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'error', 'Mercado não autorizado.');
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
  v_disponivel bigint;
  v_ledger_id uuid;
begin
  select * into v_tx from public.hb_credit_transactions
  where id = p_transaction_id and cooperative_cnpj = p_cooperative_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Transação não encontrada.');
  end if;

  if v_tx.status <> 'posted' or v_tx.event_type <> 'PAYMENT' then
    return jsonb_build_object('ok', false, 'error', 'Transação não pode ser estornada.');
  end if;

  select * into v_account from public.hb_credit_accounts
  where id = v_tx.account_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
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
    'credit', v_disponivel, jsonb_build_object('memo', 'Estorno Conta Coop')
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
