-- Homologação: entrada e saída devem conservar recursos, sem inflar limite.
begin;
set local statement_timeout='30s';
do $$
declare
  tag text:='hb_fixture_'||replace(gen_random_uuid()::text,'-','');
  cnpj text:='99999999999999';
  intent_id text;
  payer uuid;
  receiver uuid;
  result jsonb;
begin
  if exists(select 1 from public.hb_credit_accounts where cooperative_cnpj in(cnpj,'88888888888888')) then
    raise exception 'CNPJs reservados ocupados';
  end if;
  intent_id:='ctrf_'||tag;
  insert into public.hb_credit_accounts(cooperative_cnpj,cooperado_id,limit_released_cents,
    financial_limit_base_cents,financial_limit_ceiling_cents,own_balance_cents)
  values(cnpj,tag,10000,20000,10000,300) returning id into payer;
  insert into public.hb_credit_accounts(cooperative_cnpj,cooperado_id,limit_released_cents,
    financial_limit_base_cents,financial_limit_ceiling_cents)
  values(cnpj,tag||'_receiver',0,0,0) returning id into receiver;
  insert into public.hb_credit_accounts(cooperative_cnpj,cooperado_id)
  values(cnpj,tag||'_stranger'),('88888888888888',tag||'_outside');
  insert into public.hb_credit_cashback_balances(cooperative_cnpj,cooperado_id,available_cents)
  values(cnpj,tag,500),(cnpj,tag||'_receiver',200),('88888888888888',tag||'_outside',900);
  insert into public.hb_credit_cooperado_transfer_intents
    (id,cooperative_cnpj,receiver_cooperado_id,amount_cents,nonce,expires_at)
  values(intent_id,cnpj,tag||'_receiver',1000,tag,now()+interval '1 hour');
  set local role service_role;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,'wrong',tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Nonce incorreto aceito'; end if;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,'88888888888888',tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Outra cooperativa aceita'; end if;
  update public.hb_credit_cooperado_transfer_intents set receiver_cooperado_id=tag where id=intent_id;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Transferência para si mesmo aceita'; end if;
  update public.hb_credit_cooperado_transfer_intents set receiver_cooperado_id=tag||'_outside' where id=intent_id;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Destinatário fora da cooperativa aceito'; end if;
  update public.hb_credit_cooperado_transfer_intents set receiver_cooperado_id=tag||'_receiver' where id=intent_id;
  update public.hb_credit_accounts set status='suspended' where id=receiver;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Destinatário suspenso aceito'; end if;
  update public.hb_credit_accounts set status='active' where id=receiver;
  update public.hb_credit_accounts set financial_limit_sync_state='STALE' where id=payer;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Uso de crédito desatualizado aceito'; end if;
  update public.hb_credit_accounts set financial_limit_sync_state='SYNCED' where id=payer;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'Transferência falhou: %',result; end if;
  if not exists(select 1 from public.hb_credit_accounts where id=payer and own_balance_cents=0
      and amount_used_cents=700 and limit_released_cents=10000)
    or not exists(select 1 from public.hb_credit_accounts where id=receiver and own_balance_cents=1000
      and amount_used_cents=0 and limit_released_cents=0 and financial_limit_ceiling_cents=0) then
    raise exception 'Transferência inflou limite ou não conservou a composição de recursos';
  end if;
  if (select sum(case when direction='credit' then amount_cents else -amount_cents end)
    from public.hb_credit_ledger_entries where transaction_id in(intent_id,intent_id||':received'))<>0 then
    raise exception 'Entradas e saídas da transferência não fecham';
  end if;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag,cnpj,tag,'new_receipt');
  if coalesce((result->>'duplicate')::boolean,false) is not true or result->>'receipt_code'<>'receipt' then
    raise exception 'Repetição não preservou comprovante';
  end if;
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id,tag,tag||'_stranger',cnpj,tag,'receipt');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Outro pagador recebeu confirmação da operação'; end if;

  -- Devolução usando somente saldo próprio: nenhum novo crédito é tomado.
  insert into public.hb_credit_cooperado_transfer_intents
    (id,cooperative_cnpj,receiver_cooperado_id,amount_cents,nonce,expires_at)
  values(intent_id||'_back',cnpj,tag,1000,tag,now()+interval '1 hour');
  result:=public.hb_credit_authorize_cooperado_transfer(intent_id||'_back',tag,tag||'_receiver',cnpj,tag||'_back','receipt_back');
  if coalesce((result->>'ok')::boolean,false) is not true
    or (select own_balance_cents from public.hb_credit_accounts where id=payer)<>1000
    or (select own_balance_cents from public.hb_credit_accounts where id=receiver)<>0
    or (select amount_used_cents from public.hb_credit_accounts where id=payer)<>700 then
    raise exception 'Repasse de saldo próprio criou dívida';
  end if;
  insert into public.hb_credit_cooperado_transfer_intents
    (id,cooperative_cnpj,receiver_cooperado_id,amount_cents,nonce,expires_at)
  values(intent_id||'_collision',cnpj,tag||'_receiver',800,tag,now()+interval '1 hour');
  insert into public.hb_credit_transactions
    (id,cooperative_cnpj,account_id,cooperado_id,event_type,amount_cents,idempotency_key,credit_debited_cents)
  values(intent_id||'_collision',cnpj,payer,tag,'ADJUSTMENT',800,tag||'_collision',0);
  begin
    perform public.hb_credit_authorize_cooperado_transfer(intent_id||'_collision',tag,tag,cnpj,tag||'_collision','receipt_collision');
    raise exception 'Colisão não recusada';
  exception when unique_violation then null;
  end;
  if (select own_balance_cents from public.hb_credit_accounts where id=payer)<>1000
    or (select own_balance_cents from public.hb_credit_accounts where id=receiver)<>0
    or (select status from public.hb_credit_cooperado_transfer_intents where id=intent_id||'_collision')<>'PENDING' then
    raise exception 'Falha parcial deixou transferência aplicada';
  end if;
  result:=public.hb_credit_sweep_cashback_to_credit(cnpj,'2026-11',tag);
  if coalesce((result->>'ok')::boolean,false) is not true or (result->>'total_cents')::bigint<>700 then
    raise exception 'Conversão de cashback divergiu: %',result;
  end if;
  if (select own_balance_cents from public.hb_credit_accounts where id=payer)<>1500
    or (select own_balance_cents from public.hb_credit_accounts where id=receiver)<>200
    or (select limit_released_cents from public.hb_credit_accounts where id=receiver)<>0
    or (select amount_used_cents from public.hb_credit_accounts where id=payer)<>700
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj='88888888888888' and cooperado_id=tag||'_outside')<>900 then
    raise exception 'Conversão alterou limite, dívida ou outra cooperativa';
  end if;
  update public.hb_credit_cashback_balances set available_cents=50 where cooperative_cnpj=cnpj and cooperado_id=tag;
  result:=public.hb_credit_sweep_cashback_to_credit(cnpj,'2026-11',tag);
  if (result->>'total_cents')::bigint<>0
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>50 then
    raise exception 'Repetição consumiu cashback posterior';
  end if;
  result:=public.hb_credit_sweep_cashback_to_credit(cnpj,'2026-12',tag);
  if (result->>'total_cents')::bigint<>50
    or (select own_balance_cents from public.hb_credit_accounts where id=payer)<>1550 then
    raise exception 'Conversão posterior não preservou composição';
  end if;
  reset role;
end $$;
rollback;
select 'PASS: saldo próprio separado, transferência com crédito e com recursos próprios, conservação, isolamento, repetição, rollback e cashback sem inflar limite; fixtures revertidas' as result;
