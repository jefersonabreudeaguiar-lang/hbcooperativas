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

  insert into public.hb_credit_app_repasse
    (id,cooperative_cnpj,mes_referencia,amount_cents,responsavel_user_id,responsavel_nome,livro_caixa_origem_id,paid_at)
  values(tag,cnpj,'2026-10',12345,tag,'Fixture','hb_app_'||tag,'2026-11-02T01:00:00Z');
  insert into public.hb_credit_app_repasse
    (id,cooperative_cnpj,mes_referencia,amount_cents,responsavel_user_id,responsavel_nome,livro_caixa_origem_id)
  values(tag||'_other_coop','88888888888888','2026-10',999,tag,'Other','hb_app_'||tag||'_other');
  set local role service_role;
  result:=public.hb_credit_cashback_to_receivable(cnpj,tag,'2026-11',tag,tag);
  if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'Preparação do cashback falhou';end if;
  snapshot:=public.hb_credit_operational_financial_snapshot(cnpj);
  if coalesce((snapshot->>'ok')::boolean,false) is not true
    or snapshot->'book'->>'cooperativaId'<>coop::text
    or jsonb_array_length(snapshot->'book'->'entries')<>1
    or snapshot->'book'->'entries'->0->>'id'<>tag
    or snapshot->'book'->'entries'->0->>'month'<>'2026-10'
    or snapshot->'book'->'entries'->0->>'date'<>'2026-11-01'
    or (snapshot->'book'->'entries'->0->>'amountCents')::bigint<>12345
    or jsonb_array_length(snapshot->'cashback'->'entries')<>1
    or (snapshot->'cashback'->'entries'->0->>'amountCents')::bigint<>800 then
    raise exception 'Registro financeiro permanente divergente: %',snapshot;end if;
  if public.hb_credit_operational_financial_snapshot(cnpj)<>snapshot then raise exception 'Leitura modificou o histórico';end if;
  if coalesce((public.hb_credit_operational_financial_snapshot(null)->>'ok')::boolean,true) then
    raise exception 'CNPJ nulo aceito';end if;
  if has_function_privilege('anon','public.hb_credit_operational_financial_snapshot(text)','EXECUTE')
    or has_function_privilege('authenticated','public.hb_credit_operational_financial_snapshot(text)','EXECUTE') then
    raise exception 'Histórico financeiro exposto ao público';end if;
  reset role;
end $$;
rollback;
select 'PASS: caixa e cashback recuperáveis em leitura única, mês antigo e data brasileira corretos, isolamento, sem alterar histórico, acesso público negado; fixtures revertidas' as result;
