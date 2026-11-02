-- Fonte da rotina atual: 20261001200000; exige conta ativa em ambas as assinaturas.
set local lock_timeout = '5s';
create or replace function public.hb_credit_authorize_payment(
  p_intent_id text,
  p_nonce text,
  p_cooperado_id text,
  p_cooperative_cnpj text,
  p_idempotency_key text,
  p_transaction_id text,
  p_receivable_id text,
  p_receipt_code text,
  p_actor_user_id text,
  p_cashback_applied_cents bigint default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent public.hb_credit_payment_intents%rowtype;
  v_account public.hb_credit_accounts%rowtype;
  v_partner public.hb_credit_partners%rowtype;
  v_existing public.hb_credit_transactions%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
  v_gross bigint;
  v_discount_pct numeric(5, 2);
  v_discount bigint;
  v_net bigint;
  v_cashback_earn bigint;
  v_app bigint;
  v_coop bigint;
  v_cashback_bal bigint;
  v_cashback_use bigint;
  v_credit_debit bigint;
  v_own_use bigint;
  v_mes text;
  v_sync_state text;
  v_check jsonb;
begin
  select * into v_existing from public.hb_credit_transactions
  where cooperative_cnpj = p_cooperative_cnpj and idempotency_key = p_idempotency_key;

  if found then
    select * into v_account from public.hb_credit_accounts
    where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = p_cooperado_id;
    if found then
      v_disponivel := public.hb_credit_effective_disponivel_cents(
        v_account.limit_released_cents,
        v_account.financial_limit_cap_cents,
        v_account.amount_used_cents
      );
    else
      v_disponivel := 0;
    end if;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transacao_id', v_existing.id,
      'disponivel_apos_centavos', v_disponivel
    );
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

  if v_account.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Cooperado bloqueado para pagamentos.');
  end if;

  v_gross := v_intent.amount_cents;
  v_discount_pct := coalesce(v_partner.partner_discount_percent, 0);
  v_discount := round(v_gross * v_discount_pct / 100.0);
  v_net := v_gross - v_discount;
  v_cashback_earn := (v_discount * 60) / 100;
  v_app := (v_discount * 30) / 100;
  v_coop := v_discount - v_cashback_earn - v_app;
  v_mes := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');

  v_cashback_use := greatest(0, coalesce(p_cashback_applied_cents, 0));
  if v_cashback_use > v_gross then
    v_cashback_use := v_gross;
  end if;

  select coalesce(available_cents, 0) into v_cashback_bal
  from public.hb_credit_cashback_balances
  where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = p_cooperado_id;

  if not found then
    v_cashback_bal := 0;
  end if;

  if v_cashback_use > v_cashback_bal then
    v_cashback_use := v_cashback_bal;
  end if;

  v_own_use := least(v_account.own_balance_cents, v_gross - v_cashback_use);
  v_credit_debit := v_gross - v_cashback_use - v_own_use;
  if v_credit_debit > 0 then
  v_sync_state := coalesce(v_account.financial_limit_sync_state, 'SYNCED');
  if v_sync_state <> 'SYNCED' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'HB_CREDIT_STATE_STALE',
      'error', 'O crédito está sendo atualizado. Aguarde alguns instantes e tente novamente.'
    );
  end if;

  v_check := public.hb_credit_validate_financial_limit_row(
    v_account.limit_released_cents,
    v_account.financial_limit_cap_cents,
    v_account.amount_used_cents,
    v_account.financial_limit_base_cents,
    v_account.financial_limit_ceiling_cents
  );

  if coalesce((v_check->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'error_code', coalesce(v_check->>'error_code', 'HB_CREDIT_LIMIT_DIVERGENT'),
      'error', coalesce(v_check->>'error', 'Limite HB divergente do snapshot autoritativo.')
    );
  end if;

  end if;
  v_disponivel := public.hb_credit_effective_disponivel_cents(
    v_account.limit_released_cents,
    v_account.financial_limit_cap_cents,
    v_account.amount_used_cents
  );

  if coalesce(v_account.financial_limit_base_cents, -1) = 0 and v_disponivel <= 0 and v_credit_debit > 0 then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'HB_CREDIT_LIMIT_DIVERGENT',
      'error', 'Crédito HB indisponível com base financeira zerada.'
    );
  end if;

  if v_disponivel < v_credit_debit then
    return jsonb_build_object('ok', false, 'error', 'Limite insuficiente.');
  end if;

  update public.hb_credit_accounts
  set amount_used_cents = amount_used_cents + v_credit_debit,
      own_balance_cents = own_balance_cents - v_own_use,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_disponivel - v_credit_debit;

  if v_cashback_earn > 0 or v_cashback_use > 0 then
    insert into public.hb_credit_cashback_balances (
      cooperative_cnpj, cooperado_id, available_cents, lifetime_earned_cents, lifetime_used_cents, updated_at
    ) values (
      p_cooperative_cnpj, p_cooperado_id,
      greatest(0, v_cashback_earn - v_cashback_use),
      v_cashback_earn,
      v_cashback_use,
      now()
    )
    on conflict (cooperative_cnpj, cooperado_id) do update set
      available_cents = public.hb_credit_cashback_balances.available_cents + v_cashback_earn - v_cashback_use,
      lifetime_earned_cents = public.hb_credit_cashback_balances.lifetime_earned_cents + v_cashback_earn,
      lifetime_used_cents = public.hb_credit_cashback_balances.lifetime_used_cents + v_cashback_use,
      updated_at = now();
  end if;

  update public.hb_credit_payment_intents
  set status = 'CONFIRMED', updated_at = now(), confirmed_at = now(), cooperado_id = p_cooperado_id
  where id = p_intent_id;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key, receipt_code,
    gross_amount_cents, partner_discount_percent, discount_cents, net_receivable_cents,
    credit_debited_cents, cashback_applied_cents, own_balance_applied_cents
  ) values (
    p_transaction_id, p_cooperative_cnpj, v_account.id, p_intent_id, v_intent.partner_id, p_cooperado_id,
    'PAYMENT', v_gross, 'posted', p_idempotency_key, p_receipt_code,
    v_gross, v_discount_pct, v_discount, v_net, v_credit_debit, v_cashback_use, v_own_use
  );

  insert into public.hb_credit_receivables (
    id, cooperative_cnpj, partner_id, transaction_id, amount_cents, status,
    gross_amount_cents, discount_cents, net_amount_cents
  ) values (
    p_receivable_id, p_cooperative_cnpj, v_intent.partner_id, p_transaction_id,
    v_net, 'OPEN', v_gross, v_discount, v_net
  );

  if v_discount > 0 then
    insert into public.hb_credit_discount_allocations (
      cooperative_cnpj, transaction_id, cooperado_id, partner_id, mes_referencia,
      gross_cents, discount_cents, net_partner_cents, cashback_cents, app_cents, coop_cents
    ) values (
      p_cooperative_cnpj, p_transaction_id, p_cooperado_id, v_intent.partner_id, v_mes,
      v_gross, v_discount, v_net, v_cashback_earn, v_app, v_coop
    );
  end if;

  if v_credit_debit > 0 then
  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'PAYMENT', v_credit_debit,
    'debit', v_disponivel,
    jsonb_build_object(
      'memo', coalesce(v_intent.description, 'Pagamento Conta Coop'),
      'gross_cents', v_gross,
      'cashback_applied_cents', v_cashback_use,
      'discount_cents', v_discount,
      'net_partner_cents', v_net
    )
  );

  end if;
  if v_own_use > 0 then
    insert into public.hb_credit_ledger_entries (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
    values (p_cooperative_cnpj,v_account.id,p_transaction_id,'OWN_BALANCE_USE',v_own_use,'debit',v_account.own_balance_cents-v_own_use,jsonb_build_object('memo','Saldo próprio utilizado no pagamento'));
  end if;

  if v_cashback_use > 0 then
    v_ledger_id := gen_random_uuid();
    insert into public.hb_credit_ledger_entries (
      id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
      direction, balance_reference_cents, metadata
    ) values (
      v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'CASHBACK_USE', v_cashback_use,
      'debit', v_disponivel,
      jsonb_build_object('memo', 'Cashback aplicado no pagamento')
    );
  end if;

  if v_cashback_earn > 0 then
    v_ledger_id := gen_random_uuid();
    insert into public.hb_credit_ledger_entries (
      id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
      direction, balance_reference_cents, metadata
    ) values (
      v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'CASHBACK_EARN', v_cashback_earn,
      'credit', v_disponivel,
      jsonb_build_object('memo', 'Cashback 60% do desconto do mercado')
    );
  end if;

  insert into public.hb_credit_idempotency_records (
    cooperative_cnpj, scope, idempotency_key, result_reference_id
  ) values (
    p_cooperative_cnpj, 'payment_authorize', p_idempotency_key, p_transaction_id
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'PAYMENT_CONFIRMED', 'transaction', p_transaction_id,
    jsonb_build_object(
      'gross_cents', v_gross,
      'credit_debited_cents', v_credit_debit,
      'cashback_applied_cents', v_cashback_use,
      'discount_cents', v_discount,
      'net_partner_cents', v_net,
      'cooperado_id', p_cooperado_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'transacao_id', p_transaction_id,
    'disponivel_apos_centavos', v_disponivel,
    'amount_centavos', v_gross,
    'credit_debited_cents', v_credit_debit,
    'own_balance_applied_cents', v_own_use,
    'own_balance_available_cents', v_account.own_balance_cents-v_own_use,
    'cashback_applied_cents', v_cashback_use,
    'cashback_earned_cents', v_cashback_earn
  );
end;
$$;


revoke all on function public.hb_credit_authorize_payment(text,text,text,text,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.hb_credit_authorize_payment(text,text,text,text,text,text,text,text,text,bigint) to service_role;
-- Estorno único e consistente, usando a composição registrada na venda.
set local lock_timeout = '5s';
create or replace function public.hb_credit_refund_payment(
  p_transaction_id text, p_cooperative_cnpj text, p_refund_transaction_id text,
  p_refund_id text, p_actor_user_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  tx public.hb_credit_transactions%rowtype;
  account public.hb_credit_accounts%rowtype;
  allocation public.hb_credit_discount_allocations%rowtype;
  balance public.hb_credit_cashback_balances%rowtype;
  credit_restore bigint;
  own_restore bigint;
  cashback_restore bigint;
  cashback_reverse bigint;
  available bigint;
begin
  -- O mesmo bloqueio serializa dois pedidos de estorno da mesma venda.
  select * into tx from public.hb_credit_transactions
    where id=p_transaction_id and cooperative_cnpj=p_cooperative_cnpj for update;
  if not found then return jsonb_build_object('ok',false,'error','Transação não encontrada.'); end if;
  select * into account from public.hb_credit_accounts
    where id=tx.account_id and cooperative_cnpj=p_cooperative_cnpj
      and cooperado_id=tx.cooperado_id for update;
  if not found then return jsonb_build_object('ok',false,'error','Conta não encontrada.'); end if;
  available := public.hb_credit_effective_disponivel_cents(
    account.limit_released_cents,account.financial_limit_cap_cents,account.amount_used_cents);
  if exists (select 1 from public.hb_credit_refunds
    where original_transaction_id=tx.id and cooperative_cnpj=p_cooperative_cnpj and status='posted') then
    return jsonb_build_object('ok',true,'duplicate',true,'transacao_id',tx.id,'disponivel_apos_centavos',available);
  end if;
  if tx.status<>'posted' or tx.event_type<>'PAYMENT' then
    return jsonb_build_object('ok',false,'error','Transação não pode ser estornada.');
  end if;
  credit_restore := coalesce(tx.credit_debited_cents,tx.amount_cents);
  cashback_restore := coalesce(tx.cashback_applied_cents,0);
  own_restore := coalesce(tx.own_balance_applied_cents,0);
  if credit_restore<0 or cashback_restore<0 or own_restore<0 or credit_restore+cashback_restore+own_restore<>tx.amount_cents
     or account.amount_used_cents<credit_restore then
    return jsonb_build_object('ok',false,'error_code','HB_REFUND_RECONCILIATION_REQUIRED',
      'error','A composição do pagamento precisa ser conferida antes do estorno.');
  end if;
  select * into allocation from public.hb_credit_discount_allocations
    where transaction_id=tx.id and cooperative_cnpj=p_cooperative_cnpj for update;
  cashback_reverse := coalesce(allocation.cashback_cents,0);
  select * into balance from public.hb_credit_cashback_balances
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=tx.cooperado_id for update;
  if coalesce(balance.available_cents,0)+cashback_restore<cashback_reverse then
    return jsonb_build_object('ok',false,'error_code','HB_REFUND_CASHBACK_RECONCILIATION_REQUIRED',
      'error','O cashback desta compra já foi utilizado. Confira a composição antes do estorno.');
  end if;

  update public.hb_credit_accounts set amount_used_cents=amount_used_cents-credit_restore,
    own_balance_cents=own_balance_cents+own_restore,
    updated_at=now(),updated_by=p_actor_user_id where id=account.id;
  available := public.hb_credit_effective_disponivel_cents(account.limit_released_cents,
    account.financial_limit_cap_cents,account.amount_used_cents-credit_restore);
  if cashback_reverse>0 or cashback_restore>0 then
    insert into public.hb_credit_cashback_balances
      (cooperative_cnpj,cooperado_id,available_cents,lifetime_earned_cents,lifetime_used_cents,updated_at)
    values (p_cooperative_cnpj,tx.cooperado_id,
      coalesce(balance.available_cents,0)+cashback_restore-cashback_reverse,
      greatest(0,coalesce(balance.lifetime_earned_cents,0)-cashback_reverse),
      greatest(0,coalesce(balance.lifetime_used_cents,0)-cashback_restore),now())
    on conflict (cooperative_cnpj,cooperado_id) do update set
      available_cents=excluded.available_cents,lifetime_earned_cents=excluded.lifetime_earned_cents,
      lifetime_used_cents=excluded.lifetime_used_cents,updated_at=excluded.updated_at;
  end if;
  update public.hb_credit_transactions set status='reversed' where id=tx.id;
  update public.hb_credit_payment_intents set status='REFUNDED',updated_at=now()
    where id=tx.payment_intent_id and cooperative_cnpj=p_cooperative_cnpj;
  update public.hb_credit_receivables set status='BLOCKED_FOR_REVIEW',updated_at=now()
    where transaction_id=tx.id and cooperative_cnpj=p_cooperative_cnpj;
  update public.hb_credit_discount_allocations set cashback_status='REVERSED',
    app_pool_status=case when app_pool_status='LIQUIDATED' then app_pool_status else 'REVERSED' end,
    coop_pool_status=case when coop_pool_status='LIQUIDATED' then coop_pool_status else 'REVERSED' end
    where transaction_id=tx.id and cooperative_cnpj=p_cooperative_cnpj;
  insert into public.hb_credit_transactions
    (id,cooperative_cnpj,account_id,partner_id,cooperado_id,event_type,amount_cents,status,
     idempotency_key,gross_amount_cents,credit_debited_cents,cashback_applied_cents,own_balance_applied_cents)
  values (p_refund_transaction_id,p_cooperative_cnpj,account.id,tx.partner_id,tx.cooperado_id,
    'REFUND',tx.amount_cents,'posted','refund:'||tx.id,tx.amount_cents,credit_restore,cashback_restore,own_restore);
  insert into public.hb_credit_refunds
    (id,cooperative_cnpj,original_transaction_id,refund_transaction_id,amount_cents,status)
  values (p_refund_id,p_cooperative_cnpj,tx.id,p_refund_transaction_id,tx.amount_cents,'posted');
  -- A tabela não aceita movimento de crédito com valor zero.
  if credit_restore>0 then
    insert into public.hb_credit_ledger_entries
      (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
    values (p_cooperative_cnpj,account.id,p_refund_transaction_id,'REFUND',credit_restore,'credit',available,
      jsonb_build_object('memo','Estorno HB Créditos','original_transaction_id',tx.id,
        'payment_intent_id',tx.payment_intent_id,'gross_cents',tx.amount_cents,
        'cashback_restored_cents',cashback_restore,'cashback_reversed_cents',cashback_reverse));
  end if;
  if own_restore>0 then
    insert into public.hb_credit_ledger_entries (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
    values (p_cooperative_cnpj,account.id,p_refund_transaction_id,'OWN_BALANCE_REFUND',own_restore,'credit',account.own_balance_cents+own_restore,jsonb_build_object('memo','Estorno em saldo próprio','original_transaction_id',tx.id));
  end if;
  insert into public.hb_credit_audit_log (cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
  values (p_cooperative_cnpj,p_actor_user_id,'REFUND_CREATED','transaction',p_refund_transaction_id,
    jsonb_build_object('original_transaction_id',tx.id,'amount_cents',tx.amount_cents,
      'credit_restored_cents',credit_restore,'own_balance_restored_cents',own_restore,'cashback_restored_cents',cashback_restore,
      'cashback_reversed_cents',cashback_reverse));
  return jsonb_build_object('ok',true,'transacao_id',tx.id,'disponivel_apos_centavos',available);
end;
$$;
revoke all on function public.hb_credit_refund_payment(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_refund_payment(text,text,text,text,text) to service_role;
