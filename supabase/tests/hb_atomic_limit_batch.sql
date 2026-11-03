begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$
declare r jsonb; before_state jsonb; after_state jsonb;
begin
  if exists(select 1 from hb_credit_accounts where cooperative_cnpj='99999999999999')
    or exists(select 1 from hb_credit_cooperative_caps where cooperative_cnpj='99999999999999') then
    raise exception 'Namespace ocupado; não executar ensaio';
  end if;
  if has_function_privilege('anon','public.hb_credit_save_limit_batch(text,text,jsonb,jsonb,numeric,numeric,bigint,boolean)','execute')
    or has_function_privilege('authenticated','public.hb_credit_save_limit_batch(text,text,jsonb,jsonb,numeric,numeric,bigint,boolean)','execute') then
    raise exception 'RPC exposta ao cliente';
  end if;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a","b"]','{"a":1000,"b":1000}',70,70);
  if not (r->>'ok')::boolean or (r->>'updated')::int<>2 then raise exception 'Lote inicial: %',r; end if;
  if r::text like '%pin_hash%' then raise exception 'Hash de PIN na resposta'; end if;
  update hb_credit_accounts set amount_used_cents=200,status='blocked'
    where cooperative_cnpj='99999999999999' and cooperado_id='a';
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a"]','{"a":1000,"b":1000}',null,null,600,true);
  if not (r->>'ok')::boolean then raise exception 'Limite individual: %',r; end if;
  if not exists(select 1 from hb_credit_accounts where cooperative_cnpj='99999999999999' and cooperado_id='a'
    and amount_used_cents=200 and status='blocked' and limit_released_cents=600) then raise exception 'Compra/bloqueio sobrescrito'; end if;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','[]','{"a":1000,"b":1000}',null,90,null,true);
  if not (r->>'ok')::boolean or not exists(select 1 from hb_credit_cooperative_caps
    where cooperative_cnpj='99999999999999' and global_credit_cap_percent=90 and cooperativa_liberacao_percent=70) then
    raise exception 'Alterar teto mudou percentual de liberação';
  end if;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a","b"]','{"a":1000,"b":1000}',null,null,800,true);
  if not (r->>'ok')::boolean then raise exception 'Lote fixo: %',r; end if;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a","a"]','{"a":1000,"b":1000}',70,70);
  if (r->>'ok')::boolean then raise exception 'Seleção repetida aceita'; end if;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a"]','{"a":1000,"b":1000}',null,null,100,true);
  if (r->>'ok')::boolean then raise exception 'Limite abaixo do uso aceito'; end if;
  insert into hb_credit_accounts(cooperative_cnpj,cooperado_id,limit_released_cents)
    select '99999999999999','hb_fixture_atomic_limit_outside_'||i,1 from generate_series(1,1501) i;
  select jsonb_build_object('caps',(select to_jsonb(c) from hb_credit_cooperative_caps c where cooperative_cnpj='99999999999999'),
    'a',(select to_jsonb(a) from hb_credit_accounts a where cooperative_cnpj='99999999999999' and cooperado_id='a')) into before_state;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a"]','{"a":4000,"b":0}',null,60,400,true);
  if (r->>'ok')::boolean or r->>'code'<>'HB_GLOBAL_CAP_EXCEEDED' or (r->>'totalAfterCents')::int<>2701 then
    raise exception 'Soma de 1501 contas fora da seleção incorreta: %',r;
  end if;
  select jsonb_build_object('caps',(select to_jsonb(c) from hb_credit_cooperative_caps c where cooperative_cnpj='99999999999999'),
    'a',(select to_jsonb(a) from hb_credit_accounts a where cooperative_cnpj='99999999999999' and cooperado_id='a')) into after_state;
  if before_state<>after_state then raise exception 'Recusa deixou alteração parcial'; end if;
  delete from hb_credit_accounts where cooperative_cnpj='99999999999999' and starts_with(cooperado_id,'hb_fixture_atomic_limit_outside_');
  update hb_credit_accounts set status='suspended' where cooperative_cnpj='99999999999999' and cooperado_id='b';
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit','["a","b"]','{"a":1000,"b":1000}',60,90);
  if (r->>'ok')::boolean or not exists(select 1 from hb_credit_accounts where cooperative_cnpj='99999999999999'
    and cooperado_id='a' and limit_released_cents=800) then raise exception 'Conta suspensa deixou lote parcial'; end if;
  update hb_credit_accounts set status='active' where cooperative_cnpj='99999999999999' and cooperado_id='b';
end $$;

-- Falha depois de teto e contas: o próprio bloco da RPC deve reverter tudo.
create function pg_temp.hb_fixture_atomic_audit_failure() returns trigger language plpgsql as $$
begin
  if new.actor='hb_fixture_atomic_limit_late_failure' then raise exception 'Falha simulada da auditoria'; end if;
  return new;
end $$;
create trigger hb_fixture_atomic_limit_audit before insert on public.hb_credit_audit_log
  for each row execute function pg_temp.hb_fixture_atomic_audit_failure();
do $$
declare r jsonb; before_state jsonb; after_state jsonb;
begin
  select jsonb_build_object('caps',(select to_jsonb(c) from hb_credit_cooperative_caps c where cooperative_cnpj='99999999999999'),
    'accounts',(select jsonb_agg(to_jsonb(a) order by cooperado_id) from hb_credit_accounts a where cooperative_cnpj='99999999999999')) into before_state;
  r:=hb_credit_save_limit_batch('99999999999999','hb_fixture_atomic_limit_late_failure','["a","b"]','{"a":1000,"b":1000}',50,70);
  if (r->>'ok')::boolean then raise exception 'Falha tardia aceita como sucesso'; end if;
  select jsonb_build_object('caps',(select to_jsonb(c) from hb_credit_cooperative_caps c where cooperative_cnpj='99999999999999'),
    'accounts',(select jsonb_agg(to_jsonb(a) order by cooperado_id) from hb_credit_accounts a where cooperative_cnpj='99999999999999')) into after_state;
  if before_state<>after_state then raise exception 'Falha tardia deixou teto ou conta alterada'; end if;
end $$;
rollback;
select jsonb_build_object('accounts',(select count(*) from hb_credit_accounts where cooperative_cnpj='99999999999999'),
  'caps',(select count(*) from hb_credit_cooperative_caps where cooperative_cnpj='99999999999999'),
  'audit',(select count(*) from hb_credit_audit_log where starts_with(actor,'hb_fixture_atomic_limit')),
  'trigger',(select count(*) from pg_trigger where tgname='hb_fixture_atomic_limit_audit')) as remaining_fixture;
