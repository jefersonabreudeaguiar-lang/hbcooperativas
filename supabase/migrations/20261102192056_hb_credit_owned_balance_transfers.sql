-- Saldo próprio não aumenta limite baseado em entregas nem participa do teto global.
set local lock_timeout='5s';
alter table public.hb_credit_accounts add column if not exists own_balance_cents bigint not null default 0 check(own_balance_cents>=0);
alter table public.hb_credit_transactions add column if not exists own_balance_applied_cents bigint not null default 0 check(own_balance_applied_cents>=0);
alter table public.hb_credit_cooperado_transfer_intents
  add column if not exists credit_debited_cents bigint check(credit_debited_cents>=0),
  add column if not exists own_balance_applied_cents bigint check(own_balance_applied_cents>=0);

create or replace function public.hb_credit_authorize_cooperado_transfer(
  p_intent_id text,p_nonce text,p_payer_cooperado_id text,p_cooperative_cnpj text,p_idempotency_key text,p_receipt_code text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  intent public.hb_credit_cooperado_transfer_intents%rowtype;
  payer public.hb_credit_accounts%rowtype;
  receiver public.hb_credit_accounts%rowtype;
  check_result jsonb;
  own_debit bigint;
  credit_debit bigint;
  remaining bigint;
begin
  if coalesce(p_intent_id,'') not like 'ctrf\_%' escape '\'
    or nullif(trim(p_idempotency_key),'') is null or nullif(trim(p_receipt_code),'') is null then
    return jsonb_build_object('ok',false,'error','Dados da transferência inválidos.');
  end if;
  select * into intent from public.hb_credit_cooperado_transfer_intents
    where id=p_intent_id and cooperative_cnpj=p_cooperative_cnpj for update;
  if not found then return jsonb_build_object('ok',false,'error','Cobrança não encontrada.'); end if;
  if intent.nonce is distinct from p_nonce or intent.receiver_cooperado_id=p_payer_cooperado_id then
    return jsonb_build_object('ok',false,'error','Cobrança ou destinatário inválido.');
  end if;
  if intent.status='CONFIRMED' then
    if intent.payer_cooperado_id is distinct from p_payer_cooperado_id then
      return jsonb_build_object('ok',false,'error','Cobrança já utilizada por outro cooperado.');
    end if;
    select * into payer from public.hb_credit_accounts
      where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=p_payer_cooperado_id;
    remaining:=public.hb_credit_effective_disponivel_cents(payer.limit_released_cents,payer.financial_limit_cap_cents,payer.amount_used_cents)+payer.own_balance_cents;
    return jsonb_build_object('ok',true,'duplicate',true,'receipt_code',intent.receipt_code,'disponivel_apos_centavos',remaining);
  end if;
  if intent.status<>'PENDING' or intent.expires_at<=now() then
    return jsonb_build_object('ok',false,'error','Cobrança encerrada ou expirada.');
  end if;
  -- Ordem única de bloqueio evita que transferências opostas prendam as contas em ordem inversa.
  perform a.id from public.hb_credit_accounts a
    where a.cooperative_cnpj=p_cooperative_cnpj and a.cooperado_id in(p_payer_cooperado_id,intent.receiver_cooperado_id)
    order by a.id for update;
  select * into payer from public.hb_credit_accounts
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=p_payer_cooperado_id;
  if not found or payer.status<>'active' then return jsonb_build_object('ok',false,'error','Conta pagadora indisponível.'); end if;
  select * into receiver from public.hb_credit_accounts
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=intent.receiver_cooperado_id;
  if not found or receiver.status<>'active' then return jsonb_build_object('ok',false,'error','Conta destinatária indisponível.'); end if;
  own_debit:=least(payer.own_balance_cents,intent.amount_cents);
  credit_debit:=intent.amount_cents-own_debit;
  if credit_debit>0 then
    check_result:=public.hb_credit_validate_financial_limit_row(payer.limit_released_cents,payer.financial_limit_cap_cents,
      payer.amount_used_cents,payer.financial_limit_base_cents,payer.financial_limit_ceiling_cents);
    if payer.financial_limit_sync_state<>'SYNCED' or coalesce((check_result->>'ok')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error','Limite HB precisa ser atualizado antes da transferência.');
    end if;
    if public.hb_credit_effective_disponivel_cents(payer.limit_released_cents,payer.financial_limit_cap_cents,payer.amount_used_cents)<credit_debit then
      return jsonb_build_object('ok',false,'error','Saldo insuficiente.');
    end if;
  end if;
  update public.hb_credit_accounts set own_balance_cents=own_balance_cents-own_debit,
    amount_used_cents=amount_used_cents+credit_debit,updated_at=now() where id=payer.id;
  update public.hb_credit_accounts set own_balance_cents=own_balance_cents+intent.amount_cents,
    updated_at=now() where id=receiver.id;
  remaining:=public.hb_credit_effective_disponivel_cents(payer.limit_released_cents,payer.financial_limit_cap_cents,payer.amount_used_cents+credit_debit)
    +payer.own_balance_cents-own_debit;
  insert into public.hb_credit_transactions
    (id,cooperative_cnpj,account_id,cooperado_id,event_type,amount_cents,idempotency_key,receipt_code,credit_debited_cents,own_balance_applied_cents)
  values(intent.id,p_cooperative_cnpj,payer.id,p_payer_cooperado_id,'ADJUSTMENT',intent.amount_cents,
      'transfer:out:'||intent.id,p_receipt_code,credit_debit,own_debit),
    (intent.id||':received',p_cooperative_cnpj,receiver.id,intent.receiver_cooperado_id,'ADJUSTMENT',intent.amount_cents,
      'transfer:in:'||intent.id,p_receipt_code,0,0);
  insert into public.hb_credit_ledger_entries
    (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
  values(p_cooperative_cnpj,payer.id,intent.id,'TRANSFER_OUT',intent.amount_cents,'debit',remaining,
      jsonb_build_object('receiver_cooperado_id',intent.receiver_cooperado_id,'credit_debited_cents',credit_debit,'own_balance_applied_cents',own_debit)),
    (p_cooperative_cnpj,receiver.id,intent.id||':received','TRANSFER_IN',intent.amount_cents,'credit',receiver.own_balance_cents+intent.amount_cents,
      jsonb_build_object('payer_cooperado_id',p_payer_cooperado_id,'own_balance_credit_cents',intent.amount_cents));
  update public.hb_credit_cooperado_transfer_intents set status='CONFIRMED',payer_cooperado_id=p_payer_cooperado_id,
    idempotency_key=p_idempotency_key,receipt_code=p_receipt_code,credit_debited_cents=credit_debit,
    own_balance_applied_cents=own_debit,confirmed_at=now(),updated_at=now() where id=intent.id;
  insert into public.hb_credit_audit_log(cooperative_cnpj,actor,actor_role,action,resource_type,resource_id,metadata)
  values(p_cooperative_cnpj,p_payer_cooperado_id,'cooperado','COOPERADO_TRANSFER_CONFIRMED','transfer',intent.id,
    jsonb_build_object('receiver_cooperado_id',intent.receiver_cooperado_id,'amount_cents',intent.amount_cents,
      'credit_debited_cents',credit_debit,'own_balance_applied_cents',own_debit));
  return jsonb_build_object('ok',true,'receipt_code',p_receipt_code,'disponivel_apos_centavos',remaining);
end $$;

create or replace function public.hb_credit_sweep_cashback_to_credit(
  p_cooperative_cnpj text,p_mes_referencia text,p_actor_user_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  account public.hb_credit_accounts%rowtype;
  cashback bigint;
  tx_id text;
  total bigint:=0;
  quantity integer:=0;
begin
  if coalesce(p_cooperative_cnpj,'') !~ '^\d{14}$' or coalesce(p_mes_referencia,'') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok',false,'error','Cooperativa ou mês inválido.');
  end if;
  for account in select a.* from public.hb_credit_accounts a
    where a.cooperative_cnpj=p_cooperative_cnpj order by a.id for update
  loop
    tx_id:='cbsweep:'||account.id::text||':'||p_mes_referencia;
    if exists(select 1 from public.hb_credit_transactions t where t.id=tx_id) then continue; end if;
    select b.available_cents into cashback from public.hb_credit_cashback_balances b
      where b.cooperative_cnpj=p_cooperative_cnpj and b.cooperado_id=account.cooperado_id for update;
    if coalesce(cashback,0)<=0 then continue; end if;
    update public.hb_credit_accounts set own_balance_cents=own_balance_cents+cashback,updated_at=now(),updated_by=p_actor_user_id where id=account.id;
    update public.hb_credit_cashback_balances set available_cents=0,updated_at=now()
      where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=account.cooperado_id;
    insert into public.hb_credit_transactions
      (id,cooperative_cnpj,account_id,cooperado_id,event_type,amount_cents,idempotency_key,credit_debited_cents)
    values(tx_id,p_cooperative_cnpj,account.id,account.cooperado_id,'ADJUSTMENT',cashback,tx_id,0);
    insert into public.hb_credit_ledger_entries
      (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
    values(p_cooperative_cnpj,account.id,tx_id,'CASHBACK_SWEEP',cashback,'debit',account.own_balance_cents,
        jsonb_build_object('mes_referencia',p_mes_referencia,'memo','Cashback convertido em saldo próprio')),
      (p_cooperative_cnpj,account.id,tx_id,'OWN_BALANCE_CREDIT',cashback,'credit',account.own_balance_cents+cashback,
        jsonb_build_object('mes_referencia',p_mes_referencia,'memo','Saldo próprio recebido do cashback'));
    total:=total+cashback; quantity:=quantity+1;
  end loop;
  if quantity>0 then
    insert into public.hb_credit_audit_log(cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
    values(p_cooperative_cnpj,p_actor_user_id,'CASHBACK_SWEPT_TO_CREDIT','month',p_mes_referencia,
      jsonb_build_object('total_cents',total,'cooperados',quantity));
  end if;
  return jsonb_build_object('ok',true,'total_cents',total,'cooperados',quantity);
end $$;
revoke all on function public.hb_credit_authorize_cooperado_transfer(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_authorize_cooperado_transfer(text,text,text,text,text,text) to service_role;
revoke all on function public.hb_credit_sweep_cashback_to_credit(text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_sweep_cashback_to_credit(text,text,text) to service_role;
