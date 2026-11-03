-- Homologação apenas. Dados fictícios sempre revertidos.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $$
declare
  v_row public.hb_credit_accounts;
begin
  if exists (select 1 from public.hb_credit_accounts where cooperative_cnpj='99999999999999') then
    raise exception 'Namespace de teste ocupado; não continuar';
  end if;
  insert into public.hb_credit_accounts (cooperative_cnpj,cooperado_id,limit_released_cents,amount_used_cents,status)
    values ('99999999999999','hb_fixture_limit_partial_upsert',1000,200,'active');
  -- Compra e bloqueio registrados após a leitura anterior de usado=200/ativo.
  update public.hb_credit_accounts set amount_used_cents=700,status='blocked'
    where cooperative_cnpj='99999999999999' and cooperado_id='hb_fixture_limit_partial_upsert';
  insert into public.hb_credit_accounts (cooperative_cnpj,cooperado_id,limit_released_cents,financial_limit_cap_cents)
    values ('99999999999999','hb_fixture_limit_partial_upsert',1500,1500)
    on conflict (cooperative_cnpj,cooperado_id) do update set
      limit_released_cents=excluded.limit_released_cents,
      financial_limit_cap_cents=excluded.financial_limit_cap_cents;
  select * into strict v_row from public.hb_credit_accounts
    where cooperative_cnpj='99999999999999' and cooperado_id='hb_fixture_limit_partial_upsert';
  if v_row.amount_used_cents<>700 or v_row.status<>'blocked' or v_row.limit_released_cents<>1500 then
    raise exception 'Gravação parcial alterou compra/bloqueio';
  end if;
  insert into public.hb_credit_accounts (cooperative_cnpj,cooperado_id,limit_released_cents,financial_limit_cap_cents)
    values ('99999999999999','hb_fixture_limit_partial_new',500,500);
  select * into strict v_row from public.hb_credit_accounts
    where cooperative_cnpj='99999999999999' and cooperado_id='hb_fixture_limit_partial_new';
  if v_row.amount_used_cents<>0 or v_row.status<>'active' then
    raise exception 'Defaults de conta nova divergentes';
  end if;
end $$;
rollback;
select count(*) as remaining_fixture from public.hb_credit_accounts
where cooperative_cnpj='99999999999999' and cooperado_id in ('hb_fixture_limit_partial_upsert','hb_fixture_limit_partial_new');
