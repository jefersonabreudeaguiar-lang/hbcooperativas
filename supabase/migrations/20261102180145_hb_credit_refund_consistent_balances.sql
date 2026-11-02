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
  if credit_restore<0 or cashback_restore<0 or credit_restore+cashback_restore<>tx.amount_cents
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
     idempotency_key,gross_amount_cents,credit_debited_cents,cashback_applied_cents)
  values (p_refund_transaction_id,p_cooperative_cnpj,account.id,tx.partner_id,tx.cooperado_id,
    'REFUND',tx.amount_cents,'posted','refund:'||tx.id,tx.amount_cents,credit_restore,cashback_restore);
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
  insert into public.hb_credit_audit_log (cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
  values (p_cooperative_cnpj,p_actor_user_id,'REFUND_CREATED','transaction',p_refund_transaction_id,
    jsonb_build_object('original_transaction_id',tx.id,'amount_cents',tx.amount_cents,
      'credit_restored_cents',credit_restore,'cashback_restored_cents',cashback_restore,
      'cashback_reversed_cents',cashback_reverse));
  return jsonb_build_object('ok',true,'transacao_id',tx.id,'disponivel_apos_centavos',available);
end;
$$;
revoke all on function public.hb_credit_refund_payment(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_refund_payment(text,text,text,text,text) to service_role;
