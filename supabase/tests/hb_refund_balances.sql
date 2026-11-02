-- Homologação, sem pagamentos externos. Reverte toda a massa de teste.
begin;
set local statement_timeout = '30s';
do $$
declare
  tag text := 'hb_fixture_' || replace(gen_random_uuid()::text, '-', '');
  cnpj text := '99999999999999';
  account uuid;
  result jsonb;
  cashback bigint;
  used bigint;
begin
  if exists (select 1 from public.hb_credit_accounts where cooperative_cnpj=cnpj)
    or exists (select 1 from public.hb_credit_partners where cooperative_cnpj=cnpj) then
    raise exception 'CNPJ reservado já tem dados; teste recusado';
  end if;
  insert into public.hb_credit_partners (id,cooperative_cnpj,partner_cnpj,name,email,status,partner_discount_percent)
  values (tag,cnpj,'11111111111111','Mercado fictício','refund@example.invalid','ACTIVE',10);
  insert into public.hb_credit_accounts
    (cooperative_cnpj,cooperado_id,limit_released_cents,amount_used_cents,financial_limit_base_cents,financial_limit_ceiling_cents)
  values (cnpj,tag,10000,1000,20000,10000) returning id into account;
  insert into public.hb_credit_cashback_balances
    (cooperative_cnpj,cooperado_id,available_cents,lifetime_earned_cents,lifetime_used_cents)
  values (cnpj,tag,200,200,0);
  insert into public.hb_credit_payment_intents
    (id,cooperative_cnpj,partner_id,amount_cents,nonce,expires_at,status)
  values (tag,cnpj,tag,1000,tag,now()+interval '1 hour','PENDING');
  set local role service_role;
  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag,200);
  if coalesce((result->>'ok')::boolean,false) is not true then
    raise exception 'Preparação do pagamento falhou: %',result;
  end if;
  select amount_used_cents into used from public.hb_credit_accounts where id=account;
  select available_cents into cashback from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag;
  if used<>1800 or cashback<>60 then raise exception 'Pré-condição do estorno divergente'; end if;
  result := public.hb_credit_refund_payment(tag,'88888888888888',tag||'_refund',tag||'_request',tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Estorno entre cooperativas aceito'; end if;
  -- Colisão ao inserir a transação final precisa desfazer as alterações anteriores.
  begin
    perform public.hb_credit_refund_payment(tag,cnpj,tag,tag||'_collision',tag);
    raise exception 'Colisão de identificador não foi recusada';
  exception when unique_violation then null;
  end;
  if (select amount_used_cents from public.hb_credit_accounts where id=account)<>1800
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>60
    or (select status from public.hb_credit_transactions where id=tag)<>'posted' then
    raise exception 'Falha parcial deixou alterações no saldo';
  end if;
  result := public.hb_credit_refund_payment(tag,cnpj,tag||'_refund',tag||'_request',tag);
  if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'Estorno falhou: %',result; end if;
  select amount_used_cents into used from public.hb_credit_accounts where id=account;
  select available_cents into cashback from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag;
  if used<>1000 then raise exception 'Estorno alterou dívida de outra operação: usado %, esperado 1000',used; end if;
  if cashback<>200 then raise exception 'Cashback não voltou à composição anterior: %',cashback; end if;
  if not exists (select 1 from public.hb_credit_discount_allocations where transaction_id=tag
    and cashback_status='REVERSED' and app_pool_status='REVERSED' and coop_pool_status='REVERSED') then
    raise exception 'Desconto estornado ainda disponível para liquidação';
  end if;
  if (public.hb_credit_market_receivable_snapshot(cnpj,tag)->'summaries'->0->>'totalPendenteCents')::bigint<>0 then
    raise exception 'Venda estornada continua no saldo do mercado';
  end if;
  result := public.hb_credit_refund_payment(tag,cnpj,tag||'_retry_tx',tag||'_retry_request',tag);
  if coalesce((result->>'duplicate')::boolean,false) is not true then raise exception 'Repetição de estorno não reconhecida'; end if;
  if (select amount_used_cents from public.hb_credit_accounts where id=account)<>1000
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>200
    or (select count(*) from public.hb_credit_refunds where original_transaction_id=tag)<>1 then
    raise exception 'Repetição duplicou estorno';
  end if;

  insert into public.hb_credit_payment_intents
    (id,cooperative_cnpj,partner_id,amount_cents,nonce,expires_at,status)
  values (tag||'_second',cnpj,tag,1000,tag,now()+interval '1 hour','PENDING');
  result := public.hb_credit_authorize_payment(tag||'_second',tag,tag,cnpj,
    tag||'_second',tag||'_second',tag||'_second',tag||'_second',tag,0);
  if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'Segundo pagamento falhou'; end if;
  update public.hb_credit_cashback_balances set available_cents=0
    where cooperative_cnpj=cnpj and cooperado_id=tag;
  result := public.hb_credit_refund_payment(tag||'_second',cnpj,tag||'_second_refund',tag||'_second_request',tag);
  if coalesce((result->>'ok')::boolean,true)
    or result->>'error_code'<>'HB_REFUND_CASHBACK_RECONCILIATION_REQUIRED'
    or (select amount_used_cents from public.hb_credit_accounts where id=account)<>2000
    or (select status from public.hb_credit_transactions where id=tag||'_second')<>'posted' then
    raise exception 'Cashback já consumido provocou estorno parcial ou perda silenciosa';
  end if;
  update public.hb_credit_cashback_balances set available_cents=260
    where cooperative_cnpj=cnpj and cooperado_id=tag;
  result := public.hb_credit_refund_payment(tag||'_second',cnpj,tag||'_second_refund',tag||'_second_request',tag);
  if coalesce((result->>'ok')::boolean,false) is not true
    or (select amount_used_cents from public.hb_credit_accounts where id=account)<>1000
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>200 then
    raise exception 'Estorno sem cashback aplicado não recompôs os saldos';
  end if;

  -- Estado de uma venda concluída integralmente com cashback, para testar o
  -- estorno isoladamente: não deve inserir movimento de crédito com valor zero.
  update public.hb_credit_cashback_balances set available_cents=200,
    lifetime_earned_cents=1200,lifetime_used_cents=1000
    where cooperative_cnpj=cnpj and cooperado_id=tag;
  insert into public.hb_credit_transactions
    (id,cooperative_cnpj,account_id,partner_id,cooperado_id,event_type,amount_cents,
     idempotency_key,credit_debited_cents,cashback_applied_cents)
  values (tag||'_cashback_only',cnpj,account,tag,tag,'PAYMENT',1000,tag||'_cashback_only',0,1000);
  insert into public.hb_credit_receivables
    (id,cooperative_cnpj,partner_id,transaction_id,amount_cents,status)
  values (tag||'_cashback_only',cnpj,tag,tag||'_cashback_only',1000,'OPEN');
  result := public.hb_credit_refund_payment(tag||'_cashback_only',cnpj,
    tag||'_cashback_refund',tag||'_cashback_request',tag);
  if coalesce((result->>'ok')::boolean,false) is not true
    or (select amount_used_cents from public.hb_credit_accounts where id=account)<>1000
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>1200
    or exists (select 1 from public.hb_credit_ledger_entries where transaction_id=tag||'_cashback_refund' and amount_cents=0) then
    raise exception 'Estorno integral de cashback falhou ou modificou crédito';
  end if;
  reset role;
end $$;
rollback;
select 'PASS: estorno recompõe crédito, cashback e desconto, respeita cooperativa, não duplica, desfaz falha parcial e recusa cashback indisponível sem alterar saldos; fixtures revertidas' as result;
