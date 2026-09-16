-- Reconcilia amount_used_cents a partir de PAYMENT posted (corrige estornos parciais / RPC antiga).
-- Também reforça hb_credit_refund_payment: estorno duplicado ainda alinha a conta.

create or replace function public.hb_credit_internal_sync_amount_used(
  p_account_id uuid,
  p_actor_user_id text
)
returns bigint
language plpgsql
as $$
declare
  v_account public.hb_credit_accounts%rowtype;
  v_expected bigint;
  v_applied bigint;
begin
  select * into v_account from public.hb_credit_accounts where id = p_account_id for update;
  if not found then
    return 0;
  end if;

  select coalesce(
    sum(coalesce(t.credit_debited_cents, t.amount_cents)),
    0
  )
  into v_expected
  from public.hb_credit_transactions t
  where t.account_id = p_account_id
    and t.event_type = 'PAYMENT'
    and t.status = 'posted';

  v_applied := least(greatest(v_expected, 0), v_account.limit_released_cents);

  if v_account.amount_used_cents is distinct from v_applied then
    update public.hb_credit_accounts
    set amount_used_cents = v_applied,
        updated_at = now(),
        updated_by = p_actor_user_id
    where id = p_account_id;

    insert into public.hb_credit_audit_log (
      cooperative_cnpj, actor, action, resource_type, resource_id, metadata
    ) values (
      v_account.cooperative_cnpj,
      p_actor_user_id,
      'AMOUNT_USED_RECONCILED',
      'account',
      v_account.cooperado_id,
      jsonb_build_object(
        'previous_cents', v_account.amount_used_cents,
        'expected_cents', v_expected,
        'applied_cents', v_applied
      )
    );
  end if;

  return v_applied;
end;
$$;

-- Patch: ramo duplicate do estorno alinha amount_used antes de retornar.
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
  v_alloc public.hb_credit_discount_allocations%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
  v_credit_restore bigint;
  v_cashback_use bigint;
  v_cashback_earn bigint;
  v_synced_used bigint;
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

    v_synced_used := public.hb_credit_internal_sync_amount_used(v_account.id, p_actor_user_id);
    select * into v_account from public.hb_credit_accounts where id = v_tx.account_id;
    v_disponivel := v_account.limit_released_cents - v_synced_used;
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

  v_credit_restore := coalesce(v_tx.credit_debited_cents, v_tx.amount_cents);
  v_cashback_use := coalesce(v_tx.cashback_applied_cents, 0);

  select * into v_alloc from public.hb_credit_discount_allocations where transaction_id = p_transaction_id;
  v_cashback_earn := coalesce(v_alloc.cashback_cents, 0);

  update public.hb_credit_accounts
  set amount_used_cents = greatest(0, amount_used_cents - v_credit_restore),
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_account.limit_released_cents - greatest(0, v_account.amount_used_cents - v_credit_restore);

  if v_cashback_earn > 0 or v_cashback_use > 0 then
    update public.hb_credit_cashback_balances
    set available_cents = greatest(0, available_cents - v_cashback_earn + v_cashback_use),
        lifetime_earned_cents = greatest(0, lifetime_earned_cents - v_cashback_earn),
        lifetime_used_cents = greatest(0, lifetime_used_cents - v_cashback_use),
        updated_at = now()
    where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = v_tx.cooperado_id;

    if not found then
      insert into public.hb_credit_cashback_balances (
        cooperative_cnpj, cooperado_id, available_cents, lifetime_earned_cents, lifetime_used_cents, updated_at
      ) values (
        p_cooperative_cnpj, v_tx.cooperado_id,
        greatest(0, v_cashback_use - v_cashback_earn), 0, 0, now()
      );
    end if;
  end if;

  update public.hb_credit_transactions set status = 'reversed' where id = p_transaction_id;

  if v_tx.payment_intent_id is not null then
    update public.hb_credit_payment_intents
    set status = 'REFUNDED', updated_at = now()
    where id = v_tx.payment_intent_id;
  end if;

  update public.hb_credit_receivables
  set status = 'BLOCKED_FOR_REVIEW', updated_at = now()
  where transaction_id = p_transaction_id;

  if v_alloc.transaction_id is not null then
    update public.hb_credit_discount_allocations
    set cashback_status = 'REVERSED',
        app_pool_status = case when app_pool_status = 'LIQUIDATED' then app_pool_status else 'REVERSED' end,
        coop_pool_status = case when coop_pool_status = 'LIQUIDATED' then coop_pool_status else 'REVERSED' end
    where transaction_id = p_transaction_id;
  end if;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key,
    gross_amount_cents, credit_debited_cents, cashback_applied_cents
  ) values (
    p_refund_transaction_id, p_cooperative_cnpj, v_account.id, null,
    v_tx.partner_id, v_tx.cooperado_id, 'REFUND', v_tx.amount_cents, 'posted',
    'refund:' || p_transaction_id,
    v_tx.amount_cents, v_credit_restore, v_cashback_use
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
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_refund_transaction_id, 'REFUND', v_credit_restore,
    'credit', v_disponivel,
    jsonb_build_object(
      'memo', 'Estorno Conta Coop',
      'original_transaction_id', p_transaction_id,
      'payment_intent_id', v_tx.payment_intent_id,
      'gross_cents', v_tx.amount_cents
    )
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'REFUND_CREATED', 'transaction', p_refund_transaction_id,
    jsonb_build_object(
      'original_transaction_id', p_transaction_id,
      'amount_cents', v_tx.amount_cents,
      'credit_restored_cents', v_credit_restore,
      'payment_intent_id', v_tx.payment_intent_id
    )
  );

  v_synced_used := public.hb_credit_internal_sync_amount_used(v_account.id, p_actor_user_id);
  select * into v_account from public.hb_credit_accounts where id = v_account.id;
  v_disponivel := v_account.limit_released_cents - v_synced_used;

  return jsonb_build_object('ok', true, 'transacao_id', p_transaction_id, 'disponivel_apos_centavos', v_disponivel);
end;
$$;
