-- Homologação: a conversão e o destino durável devem ser indivisíveis.
begin;
set local statement_timeout='30s';
do $$
<<fixture>>
declare
  tag text:='hb_fixture_'||replace(gen_random_uuid()::text,'-','');
  cnpj text:='99999999999999';
  coop uuid;
  result jsonb;
  snapshot jsonb;
begin
  if exists(select 1 from public.cooperativas c where c.cnpj in(fixture.cnpj,'88888888888888')) then
    raise exception 'CNPJ reservado ocupado';
  end if;
  insert into public.cooperativas(nome,cnpj,email) values('Fixture',cnpj,'cashback@example.invalid') returning id into coop;
  insert into public.hb_credit_accounts(cooperative_cnpj,cooperado_id,limit_released_cents,amount_used_cents)
  values(cnpj,tag,10000,2000),(cnpj,tag||'_other',10000,0);
  insert into public.hb_credit_cashback_balances(cooperative_cnpj,cooperado_id,available_cents,lifetime_earned_cents)
  values(cnpj,tag,800,800),(cnpj,tag||'_other',300,300);
  set local role service_role;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-13',tag,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Mês inválido aceito'; end if;
  result:=public.hb_credit_cashback_to_receivable('88888888888888',tag,'2026-11',tag,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Outra cooperativa aceita'; end if;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-11',tag,tag);
  if coalesce((result->>'ok')::boolean,false) is not true or (result->>'amount_cents')::bigint<>800 then
    raise exception 'Conversão falhou: %',result;
  end if;
  if (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>0
    or (select amount_used_cents from public.hb_credit_accounts where cooperative_cnpj=cnpj and cooperado_id=tag)<>2000 then
    raise exception 'Conversão alterou dívida ou não baixou cashback';
  end if;
  snapshot:=public.hb_credit_cashback_receivables_snapshot(cnpj);
  if snapshot->>'cooperativaId'<>coop::text or jsonb_array_length(snapshot->'entries')<>1
    or snapshot->'entries'->0->>'id'<>tag or (snapshot->'entries'->0->>'amountCents')::bigint<>800 then
    raise exception 'Destino não é recuperável pelo banco: %',snapshot;
  end if;
  update public.hb_credit_cashback_balances set available_cents=100,lifetime_earned_cents=900
    where cooperative_cnpj=cnpj and cooperado_id=tag;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-11',tag,tag);
  if coalesce((result->>'idempotent')::boolean,false) is not true
    or (select available_cents from public.hb_credit_cashback_balances where cooperative_cnpj=cnpj and cooperado_id=tag)<>100 then
    raise exception 'Repetição consumiu cashback novo';
  end if;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag||'_other','2026-11',tag,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Identificador reaproveitado por outro cooperado'; end if;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-12',tag,tag);
  if coalesce((result->>'ok')::boolean,true) then raise exception 'Identificador reaproveitado em outro mês'; end if;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-12',tag,tag||'_second');
  if coalesce((result->>'ok')::boolean,false) is not true or (result->>'amount_cents')::bigint<>100 then
    raise exception 'Nova conversão não preservou saldo correto';
  end if;
  snapshot:=public.hb_credit_cashback_receivables_snapshot(cnpj);
  if jsonb_array_length(snapshot->'entries')<>2
    or jsonb_array_length(public.hb_credit_cashback_receivables_snapshot('88888888888888')->'entries')<>0 then
    raise exception 'Histórico ou isolamento incorreto';
  end if;
  reset role;
end $$;
rollback;
select 'PASS: baixa e destino durável na mesma operação, repetição sem consumir saldo novo, escopo de cooperado/mês/cooperativa e recuperação por leitura; fixtures revertidas' as result;
