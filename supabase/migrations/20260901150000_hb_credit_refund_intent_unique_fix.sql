-- Corrige estorno Conta Coop: transação REFUND não pode reutilizar payment_intent_id
-- (constraint UNIQUE em hb_credit_transactions.payment_intent_id).

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

  if v_tx.payment_intent_id is not null then
    update public.hb_credit_payment_intents
    set status = 'REFUNDED', updated_at = now()
    where id = v_tx.payment_intent_id;
  end if;

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
    'credit', v_disponivel,
    jsonb_build_object(
      'memo', 'Estorno Conta Coop',
      'original_transaction_id', p_transaction_id,
      'payment_intent_id', v_tx.payment_intent_id
    )
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'REFUND_CREATED', 'transaction', p_refund_transaction_id,
    jsonb_build_object(
      'original_transaction_id', p_transaction_id,
      'amount_cents', v_tx.amount_cents,
      'payment_intent_id', v_tx.payment_intent_id
    )
  );

  return jsonb_build_object('ok', true, 'transacao_id', p_transaction_id, 'disponivel_apos_centavos', v_disponivel);
end;
$$;
