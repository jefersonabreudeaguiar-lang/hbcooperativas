-- Homologação: três mercados e duas cooperativas; nenhuma transferência externa.
begin;
set local statement_timeout = '30s';
do $$
declare
  tag text := 'hb_fixture_'||replace(gen_random_uuid()::text,'-','');
  cnpj text := '99999999999999';
  other_cnpj text := '88888888888888';
  result jsonb;
  i integer;
  coop text;
  item text;
begin
  if exists(select 1 from public.hb_credit_partners where cooperative_cnpj in(cnpj,other_cnpj))
    or exists(select 1 from public.hb_credit_app_repasse where cooperative_cnpj in(cnpj,other_cnpj)) then
    raise exception 'CNPJs reservados ocupados';
  end if;
  for i in 1..3 loop
    coop:=case when i=3 then other_cnpj else cnpj end;
    item:=tag||i;
    insert into public.hb_credit_partners(id,cooperative_cnpj,partner_cnpj,name,email,status)
    values(item,coop,lpad(i::text,14,'0'),'Fixture','scope@example.invalid','ACTIVE');
    insert into public.hb_credit_transactions(id,cooperative_cnpj,partner_id,cooperado_id,event_type,amount_cents,idempotency_key)
    values(item,coop,item,tag,'PAYMENT',1000,item);
    insert into public.hb_credit_settlements(id,cooperative_cnpj,partner_id,mes_referencia,total_cents,status)
    values(item,coop,item,'2026-11',900,case when i=2 then 'AWAITING_PARTNER' else 'CONFIRMED' end);
    insert into public.hb_credit_receivables(id,cooperative_cnpj,partner_id,transaction_id,amount_cents,status,settlement_id)
    values(item,coop,item,item,900,case when i=2 then 'PROCESSING' else 'SETTLED' end,item);
    insert into public.hb_credit_discount_allocations
      (cooperative_cnpj,transaction_id,cooperado_id,partner_id,mes_referencia,gross_cents,
       discount_cents,net_partner_cents,cashback_cents,app_cents,coop_cents)
    values(coop,item,tag,item,'2026-11',1000,100,900,60,30,10);
  end loop;

  update public.hb_credit_discount_allocations set app_pool_status='LIQUIDATED',
    settlement_id=tag||1 where transaction_id=tag||1;
  insert into public.hb_credit_transactions(id,cooperative_cnpj,partner_id,cooperado_id,event_type,amount_cents,idempotency_key)
    select tag||'_bulk_'||n,cnpj,tag||1,tag,'PAYMENT',1000,tag||'_bulk_'||n from generate_series(1,1500) n;
  insert into public.hb_credit_receivables(id,cooperative_cnpj,partner_id,transaction_id,amount_cents,status,settlement_id)
    select tag||'_bulk_'||n,cnpj,tag||1,tag||'_bulk_'||n,900,'SETTLED',tag||1 from generate_series(1,1500) n;
  insert into public.hb_credit_discount_allocations
    (cooperative_cnpj,transaction_id,cooperado_id,partner_id,mes_referencia,gross_cents,discount_cents,
     net_partner_cents,cashback_cents,app_cents,coop_cents,app_pool_status,settlement_id)
    select cnpj,tag||'_bulk_'||n,tag,tag||1,'2026-11',1000,100,900,60,30,10,'LIQUIDATED',tag||1
    from generate_series(1,1500) n;
  set local role service_role;
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-11');
  if (result->>'pendingAmountCents')::bigint<>45030 or (result->>'pendingCount')::bigint<>1501
    or (result->>'integrityErrors')::bigint<>0 then raise exception 'Soma completa incorreta: %',result;end if;
  result:=public.hb_credit_app_repasse_snapshot(other_cnpj,'2026-11');
  if (result->>'pendingCount')::bigint<>0 then raise exception 'Vazamento entre cooperativas';end if;
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-10');
  if (result->>'pendingCount')::bigint<>0 then raise exception 'Vazamento entre meses';end if;
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-13');
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Mês inválido aceito';end if;
  update public.hb_credit_receivables set status='OPEN' where transaction_id=tag||'_bulk_1';
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-11');
  if (result->>'integrityErrors')::bigint<>1 then raise exception 'Recebível aberto não detectado';end if;
  result:=public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_blocked',tag,'Fixture',null);
  if coalesce((result->>'ok')::boolean,true)
    or exists(select 1 from public.hb_credit_app_repasse where cooperative_cnpj=cnpj) then
    raise exception 'Confirmação aceitou composição incompleta';end if;
  update public.hb_credit_receivables set status='SETTLED' where transaction_id=tag||'_bulk_1';
  update public.hb_credit_transactions set cooperado_id=tag||'_wrong' where id=tag||'_bulk_1';
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-11');
  if (result->>'integrityErrors')::bigint<>1 then raise exception 'Cooperado divergente não detectado';end if;
  update public.hb_credit_transactions set cooperado_id=tag where id=tag||'_bulk_1';
  result:=public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_repasse',tag,'Fixture',null);
  if coalesce((result->>'ok')::boolean,false) is not true
    or (result->>'amount_cents')::bigint<>45030 or (result->>'alloc_count')::bigint<>1501 then
    raise exception 'Confirmação não corresponde ao resumo: %',result;end if;
  result:=public.hb_credit_app_repasse_snapshot(cnpj,'2026-11');
  if (result->>'pendingCount')::bigint<>0 or result->'existingRepasse'->>'id'<>tag||'_repasse'
    or (result->'existingRepasse'->>'amount_cents')::bigint<>45030 then
    raise exception 'Repasse pago reapareceu em aberto: %',result;end if;
  reset role;
end $$;
rollback;
select 'PASS: 1501 parcelas completas, escopo por mês/cooperativa, inconsistência impede confirmação, soma confirmada idêntica ao resumo e pago fora do aberto; fixtures revertidas' as result;
