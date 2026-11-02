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
  set local role service_role;
  result:=public.hb_credit_liquidate_discount_pool(cnpj,'2026-11',tag||2,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Liquidação ainda pendente foi aceita'; end if;
  result:=public.hb_credit_liquidate_discount_pool(other_cnpj,'2026-11',tag||1,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Cooperativa incorreta foi aceita'; end if;
  update public.hb_credit_receivables set status='PROCESSING' where id=tag||1;
  result:=public.hb_credit_liquidate_discount_pool(cnpj,'2026-11',tag||1,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Recebíveis incompletos foram tratados como concluídos'; end if;
  update public.hb_credit_receivables set status='SETTLED' where id=tag||1;
  result:=public.hb_credit_liquidate_discount_pool(cnpj,'2026-11',tag||1,tag);
  if coalesce((result->>'ok')::boolean,false) is not true
    or (result->>'app_cents')::bigint<>30 or (result->>'coop_cents')::bigint<>10 then
    raise exception 'Valores de outros mercados foram incluídos: %',result;
  end if;
  if exists(select 1 from public.hb_credit_discount_allocations where transaction_id in(tag||2,tag||3)
    and (app_pool_status<>'PENDING' or settlement_id is not null)) then
    raise exception 'Liquidação alterou outro mercado ou outra cooperativa';
  end if;
  result:=public.hb_credit_liquidate_discount_pool(cnpj,'2026-11',tag||1,tag);
  if coalesce((result->>'duplicate')::boolean,false) is not true
    or (select count(*) from public.hb_credit_audit_log where resource_id=tag||1 and action='DISCOUNT_POOL_LIQUIDATED')<>1 then
    raise exception 'Repetição gerou nova liquidação';
  end if;

  insert into public.hb_credit_app_repasse
    (id,cooperative_cnpj,mes_referencia,amount_cents,responsavel_user_id,responsavel_nome,livro_caixa_origem_id)
  values(tag||'_collision',other_cnpj,'2026-11',999,tag,'Fixture',tag||'_old_book');
  begin
    perform public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_collision',tag,'Fixture',null);
    raise exception 'Colisão não recusada';
  exception when unique_violation then null;
  end;
  if exists(select 1 from public.hb_credit_discount_allocations where transaction_id=tag||1 and app_repasse_id is not null)
    or exists(select 1 from public.hb_credit_app_repasse where cooperative_cnpj=cnpj) then
    raise exception 'Falha de gravação deixou repasse parcial';
  end if;
  result:=public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_repasse',tag,'Fixture',null);
  if coalesce((result->>'ok')::boolean,false) is not true
    or (result->>'amount_cents')::bigint<>30 or (result->>'alloc_count')::int<>1
    or result->>'livro_caixa_origem_id'<>'hb_app_'||tag||'_repasse' then
    raise exception 'Repasse sem composição ou origem correta: %',result;
  end if;
  result:=public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_retry',tag,'Fixture',null);
  if coalesce((result->>'duplicate')::boolean,false) is not true
    or result->>'repasse_id'<>tag||'_repasse'
    or (select count(*) from public.hb_credit_app_repasse where cooperative_cnpj=cnpj)<>1 then
    raise exception 'Repetição gerou novo pagamento ou nova origem';
  end if;
  update public.hb_credit_settlements set status='CONFIRMED' where id=tag||2;
  update public.hb_credit_receivables set status='SETTLED' where id=tag||2;
  result:=public.hb_credit_liquidate_discount_pool(cnpj,'2026-11',tag||2,tag);
  if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'Segundo mercado não liquidou'; end if;
  result:=public.hb_credit_confirm_app_repasse(cnpj,'2026-11',tag||'_late',tag,'Fixture',null);
  if coalesce((result->>'ok')::boolean,true)
    or result->>'error_code'<>'HB_REPASSE_MONTH_ALREADY_CLOSED'
    or (select app_repasse_id from public.hb_credit_discount_allocations where transaction_id=tag||2) is not null then
    raise exception 'Desconto posterior foi marcado como pago sem compor o repasse';
  end if;
  reset role;
end $$;
rollback;
select 'PASS: liquidação por mercado/cooperativa, confirmação obrigatória, repasse exato, repetição sem duplicação, origem estável e falha parcial revertida; fixtures revertidas' as result;
