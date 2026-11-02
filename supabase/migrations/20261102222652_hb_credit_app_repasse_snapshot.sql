-- Leitura consistente, completa e restrita ao servidor; não pagina valores monetários.
set local lock_timeout = '5s';
create or replace function public.hb_credit_app_repasse_snapshot(
  p_cooperative_cnpj text,p_mes_referencia text
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  previous jsonb;
  amount bigint;
  quantity bigint;
  inconsistent bigint;
begin
  if p_cooperative_cnpj is null or p_cooperative_cnpj !~ '^\d{14}$'
    or p_mes_referencia is null or p_mes_referencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok',false,'error','Cooperativa ou mês inválido.');
  end if;
  select to_jsonb(r) into previous from public.hb_credit_app_repasse r
    where r.cooperative_cnpj=p_cooperative_cnpj and r.mes_referencia=p_mes_referencia;
  with candidates as materialized (
    select a.app_cents,exists(
      select 1 from public.hb_credit_settlements s
      join public.hb_credit_receivables r on r.transaction_id=a.transaction_id
        and r.cooperative_cnpj=a.cooperative_cnpj and r.partner_id=a.partner_id
        and r.settlement_id=s.id and r.status='SETTLED'
      join public.hb_credit_transactions t on t.id=a.transaction_id
        and t.cooperative_cnpj=a.cooperative_cnpj and t.partner_id=a.partner_id
        and t.cooperado_id=a.cooperado_id and t.status='posted' and t.event_type='PAYMENT'
      where s.id=a.settlement_id and s.cooperative_cnpj=a.cooperative_cnpj
        and s.partner_id=a.partner_id and s.status='CONFIRMED'
        and s.mes_referencia=a.mes_referencia and a.cashback_status='EARNED'
    ) as eligible
    from public.hb_credit_discount_allocations a
    where a.cooperative_cnpj=p_cooperative_cnpj and a.mes_referencia=p_mes_referencia
      and a.app_pool_status='LIQUIDATED' and a.app_repasse_id is null
      and a.cashback_status<>'REVERSED' and a.app_cents>0
  ) select coalesce(sum(app_cents) filter(where eligible),0),count(*),
      count(*) filter(where not eligible) into amount,quantity,inconsistent from candidates;
  return jsonb_build_object('ok',true,'existingRepasse',previous,
    'pendingAmountCents',amount,'pendingCount',quantity,'integrityErrors',inconsistent);
end $$;
revoke all on function public.hb_credit_app_repasse_snapshot(text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_app_repasse_snapshot(text,text) to service_role;

create or replace function public.hb_credit_confirm_app_repasse(
  p_cooperative_cnpj text,p_mes_referencia text,p_repasse_id text,p_responsavel_user_id text,
  p_responsavel_nome text,p_comprovante_memo text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous public.hb_credit_app_repasse%rowtype;
  snapshot jsonb;
  ids uuid[];
  amount bigint;
  quantity integer;
  livro_id text;
begin
  if p_cooperative_cnpj !~ '^\d{14}$' or p_mes_referencia !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or nullif(trim(p_repasse_id),'') is null or nullif(trim(p_responsavel_user_id),'') is null then
    return jsonb_build_object('ok',false,'error','Dados do repasse inválidos.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hb_repasse:'||p_cooperative_cnpj||':'||p_mes_referencia,0));
  snapshot:=public.hb_credit_app_repasse_snapshot(p_cooperative_cnpj,p_mes_referencia);
  if coalesce((snapshot->>'ok')::boolean,false) is not true
    or coalesce((snapshot->>'integrityErrors')::bigint,1)>0 then
    return jsonb_build_object('ok',false,'error','Há descontos inconsistentes. Confira o fechamento antes do repasse.');
  end if;
  with selected as materialized (
    select a.id,a.app_cents from public.hb_credit_discount_allocations a
    join public.hb_credit_settlements s on s.id=a.settlement_id
      and s.cooperative_cnpj=a.cooperative_cnpj and s.partner_id=a.partner_id and s.status='CONFIRMED' and s.mes_referencia=a.mes_referencia
    join public.hb_credit_receivables r on r.transaction_id=a.transaction_id
      and r.cooperative_cnpj=a.cooperative_cnpj and r.partner_id=a.partner_id
      and r.settlement_id=s.id and r.status='SETTLED'
    join public.hb_credit_transactions t on t.id=a.transaction_id and t.cooperative_cnpj=a.cooperative_cnpj
      and t.partner_id=a.partner_id and t.cooperado_id=a.cooperado_id and t.status='posted' and t.event_type='PAYMENT'
    where a.cooperative_cnpj=p_cooperative_cnpj and a.mes_referencia=p_mes_referencia
      and a.app_pool_status='LIQUIDATED' and a.app_repasse_id is null
      and a.cashback_status='EARNED' and a.app_cents>0
    order by a.id for update of a
  ) select array_agg(id),coalesce(sum(app_cents),0),count(*) into ids,amount,quantity from selected;
  select * into previous from public.hb_credit_app_repasse
    where cooperative_cnpj=p_cooperative_cnpj and mes_referencia=p_mes_referencia;
  if found then
    if quantity>0 then
      return jsonb_build_object('ok',false,'error_code','HB_REPASSE_MONTH_ALREADY_CLOSED',
        'error','Há novos descontos após o repasse deste mês. Confira o fechamento antes de confirmar.');
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'repasse_id',previous.id,
      'amount_cents',previous.amount_cents,'livro_caixa_origem_id',previous.livro_caixa_origem_id);
  end if;
  if amount<=0 or quantity=0 then
    return jsonb_build_object('ok',false,'error','Não há repasse confirmado pendente neste mês.');
  end if;
  livro_id:='hb_app_'||p_repasse_id;
  insert into public.hb_credit_app_repasse
    (id,cooperative_cnpj,mes_referencia,amount_cents,responsavel_user_id,responsavel_nome,comprovante_memo,livro_caixa_origem_id)
  values (p_repasse_id,p_cooperative_cnpj,p_mes_referencia,amount,p_responsavel_user_id,
    p_responsavel_nome,nullif(trim(p_comprovante_memo),''),livro_id);
  -- Atualiza exatamente as linhas que compuseram o valor, nunca linhas posteriores.
  update public.hb_credit_discount_allocations set app_repasse_id=p_repasse_id where id=any(ids);
  insert into public.hb_credit_audit_log (cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
  values (p_cooperative_cnpj,p_responsavel_user_id,'APP_REPASSE_CONFIRMED','app_repasse',p_repasse_id,
    jsonb_build_object('mes_referencia',p_mes_referencia,'amount_cents',amount,
      'alloc_count',quantity,'livro_caixa_origem_id',livro_id));
  return jsonb_build_object('ok',true,'repasse_id',p_repasse_id,'amount_cents',amount,
    'alloc_count',quantity,'livro_caixa_origem_id',livro_id);
end $$;
revoke all on function public.hb_credit_confirm_app_repasse(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_confirm_app_repasse(text,text,text,text,text,text) to service_role;
