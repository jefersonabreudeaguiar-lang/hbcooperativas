-- Uma transação para o comando salvar_liberacao_percentual. Somente backend.
create or replace function public.hb_credit_save_limit_batch(
  p_cnpj text,
  p_actor text,
  p_ids jsonb,
  p_bases jsonb,
  p_percent numeric,
  p_cap_percent numeric,
  p_fixed_cents bigint default null,
  p_keep_policy boolean default false
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_ids text[];
  v_id text;
  v_base bigint;
  v_used bigint;
  v_limit bigint;
  v_ceiling bigint;
  v_total numeric;
  v_cap numeric;
  v_cap_percent numeric;
  v_changes jsonb := '[]'::jsonb;
  v_account public.hb_credit_accounts;
  v_check jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' or nullif(btrim(p_actor),'') is null then
    return jsonb_build_object('ok',false,'error','Identificação da cooperativa ou responsável inválida.');
  end if;
  if (p_percent is not null and (p_percent<0 or p_percent>100 or p_percent<>round(p_percent,2)))
    or (p_cap_percent is not null and (p_cap_percent<0 or p_cap_percent>100 or p_cap_percent<>round(p_cap_percent,2)))
    or (p_fixed_cents is not null and (p_fixed_cents<0 or p_fixed_cents>9007199254740991))
    or (p_percent is not null and p_fixed_cents is not null) then
    return jsonb_build_object('ok',false,'error','Percentual ou limite inválido.');
  end if;
  if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_typeof(p_bases) is distinct from 'object' then
    return jsonb_build_object('ok',false,'error','Base financeira ou seleção inválida.');
  end if;
  if jsonb_array_length(p_ids)>10000 or (jsonb_array_length(p_ids)=0 and (p_percent is not null or p_fixed_cents is not null or p_cap_percent is null)) then
    return jsonb_build_object('ok',false,'error','Selecione de 1 a 10000 cooperados.');
  end if;
  if jsonb_array_length(p_ids)>0 and p_percent is null and p_fixed_cents is null then
    return jsonb_build_object('ok',false,'error','Informe o percentual ou valor do limite.');
  end if;
  if exists(select 1 from jsonb_array_elements(p_ids) x where jsonb_typeof(x)<>'string') then
    return jsonb_build_object('ok',false,'error','Identificador de cooperado inválido.');
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[]) into v_ids from jsonb_array_elements_text(p_ids);
  if cardinality(v_ids)<>jsonb_array_length(p_ids) or exists(select 1 from unnest(v_ids) id where id='' or not(p_bases ? id)) then
    return jsonb_build_object('ok',false,'error','Seleção repetida ou sem base financeira autoritativa.');
  end if;
  if exists(select 1 from jsonb_each(p_bases) e where jsonb_typeof(e.value)<>'number'
    or e.value::text !~ '^[0-9]+$' or (e.value::text)::numeric>9007199254740991) then
    return jsonb_build_object('ok',false,'error','Base financeira inválida.');
  end if;
  -- Todos os lotes desta cooperativa usam a mesma trava transacional.
  perform pg_advisory_xact_lock(hashtextextended('hb-credit-limit-batch:'||p_cnpj,0));
  select global_credit_cap_percent into v_cap_percent from public.hb_credit_cooperative_caps where cooperative_cnpj=p_cnpj for update;
  v_cap_percent:=coalesce(p_cap_percent,v_cap_percent);
  if v_cap_percent is null or v_cap_percent<0 or v_cap_percent>100 or p_percent>v_cap_percent then
    return jsonb_build_object('ok',false,'error','Teto global ausente ou menor que o percentual solicitado.');
  end if;
  -- Ordem fixa e valores usados atuais: uma compra já gravada não é sobrescrita.
  perform 1 from public.hb_credit_accounts where cooperative_cnpj=p_cnpj order by cooperado_id for update;
  select coalesce(sum(round((value::text)::numeric*v_cap_percent/100)),0) into v_cap from jsonb_each(p_bases);
  if v_cap>9007199254740991 then
    return jsonb_build_object('ok',false,'error','Teto excede o valor suportado.');
  end if;
  select coalesce(sum(limit_released_cents),0) into v_total from public.hb_credit_accounts
    where cooperative_cnpj=p_cnpj and not(cooperado_id=any(v_ids));
  foreach v_id in array v_ids loop
    select * into v_account from public.hb_credit_accounts where cooperative_cnpj=p_cnpj and cooperado_id=v_id;
    if found and v_account.status='suspended' then
      return jsonb_build_object('ok',false,'error','Seleção contém conta suspensa. Utilize o cadastro atual.');
    end if;
    v_used:=coalesce(v_account.amount_used_cents,0);
    v_base:=(p_bases->>v_id)::bigint;
    if p_fixed_cents is not null and p_fixed_cents<v_used then
      return jsonb_build_object('ok',false,'error','Novo limite não pode ser menor que o valor já usado.');
    end if;
    v_limit:=coalesce(p_fixed_cents,greatest(round(v_base::numeric*p_percent/100)::bigint,v_used));
    v_ceiling:=case when v_base=0 then v_limit else round(v_base::numeric*v_cap_percent/100)::bigint end;
    v_check:=public.hb_credit_validate_financial_limit_row(v_limit,v_limit,v_used,v_base,v_ceiling);
    if not coalesce((v_check->>'ok')::boolean,false) then
      return jsonb_build_object('ok',false,'error','Uso atual ultrapassa o lastro financeiro. Confira a seleção antes de liberar.');
    end if;
    v_total:=v_total+v_limit;
    v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',v_id,'base',v_base,'limit',v_limit,'ceiling',v_ceiling));
  end loop;
  if p_percent>0 and not exists(select 1 from jsonb_array_elements(v_changes) e where (e->>'base')::bigint>0) then
    return jsonb_build_object('ok',false,'error','Não há crédito-base na nuvem para os cooperados selecionados.');
  end if;
  if v_total>v_cap then
    return jsonb_build_object('ok',false,'error','A liberação ultrapassa o teto global. Nenhum limite foi alterado.',
      'code','HB_GLOBAL_CAP_EXCEEDED','totalAfterCents',v_total,'capCents',v_cap);
  end if;
  -- Nenhuma gravação ocorre antes de toda a seleção ser validada.
  insert into public.hb_credit_cooperative_caps(cooperative_cnpj,global_credit_cap_percent,global_credit_cap_cents,cooperativa_liberacao_percent,updated_by,updated_at)
    values(p_cnpj,v_cap_percent,v_cap::bigint,case when p_keep_policy then null else p_percent end,p_actor,v_now)
    on conflict(cooperative_cnpj) do update set global_credit_cap_percent=excluded.global_credit_cap_percent,
      global_credit_cap_cents=excluded.global_credit_cap_cents,cooperativa_liberacao_percent=coalesce(excluded.cooperativa_liberacao_percent,public.hb_credit_cooperative_caps.cooperativa_liberacao_percent),
      updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.hb_credit_accounts(cooperative_cnpj,cooperado_id,limit_released_cents,financial_limit_cap_cents,
      financial_limit_base_cents,financial_limit_ceiling_cents,financial_limit_sync_state,financial_state_version,updated_by,updated_at)
    select p_cnpj,e->>'id',(e->>'limit')::bigint,(e->>'limit')::bigint,(e->>'base')::bigint,(e->>'ceiling')::bigint,'SYNCED',1,p_actor,v_now
      from jsonb_array_elements(v_changes) e
    on conflict(cooperative_cnpj,cooperado_id) do update set limit_released_cents=excluded.limit_released_cents,
      financial_limit_cap_cents=excluded.financial_limit_cap_cents,financial_limit_base_cents=excluded.financial_limit_base_cents,
      financial_limit_ceiling_cents=excluded.financial_limit_ceiling_cents,financial_limit_sync_state='SYNCED',
      financial_state_version=public.hb_credit_accounts.financial_state_version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.hb_credit_audit_log(cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
    values(p_cnpj,p_actor,'LIMIT_BATCH_SAVED','cooperative',p_cnpj,
      jsonb_build_object('percent',p_percent,'capPercent',v_cap_percent,'selected',v_ids,'totalAfterCents',v_total,'capCents',v_cap));
  return jsonb_build_object('ok',true,'updated',cardinality(v_ids),'totalAfterCents',v_total,'capCents',v_cap,
    'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'cooperative_cnpj',a.cooperative_cnpj,'cooperado_id',a.cooperado_id,
      'limit_released_cents',a.limit_released_cents,'financial_limit_cap_cents',a.financial_limit_cap_cents,
      'amount_used_cents',a.amount_used_cents,'status',a.status,'own_balance_cents',a.own_balance_cents,
      'has_financial_pin',a.pin_hash is not null,'pin_locked_until',a.pin_locked_until,'updated_at',a.updated_at)),'[]'::jsonb)
      from public.hb_credit_accounts a where a.cooperative_cnpj=p_cnpj and a.cooperado_id=any(v_ids)));
exception when others then
  -- O bloco PL/pgSQL reverte também teto/contas/auditoria se qualquer gravação falhar.
  return jsonb_build_object('ok',false,'error','Não foi possível gravar a liberação completa. Nenhuma alteração deste lote foi mantida.','code',sqlstate);
end;
$$;
revoke all on function public.hb_credit_save_limit_batch(text,text,jsonb,jsonb,numeric,numeric,bigint,boolean) from public,anon,authenticated;
grant execute on function public.hb_credit_save_limit_batch(text,text,jsonb,jsonb,numeric,numeric,bigint,boolean) to service_role;
