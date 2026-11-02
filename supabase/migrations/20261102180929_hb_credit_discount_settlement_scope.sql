-- Operações internas, restritas à liquidação efetivamente confirmada.
set local lock_timeout = '5s';
create or replace function public.hb_credit_liquidate_discount_pool(
  p_cooperative_cnpj text,p_mes_referencia text,p_settlement_id text,p_actor_user_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  settlement public.hb_credit_settlements%rowtype;
  changed integer;
  app_total bigint;
  coop_total bigint;
begin
  select * into settlement from public.hb_credit_settlements
    where id=p_settlement_id and cooperative_cnpj=p_cooperative_cnpj
      and mes_referencia=p_mes_referencia for update;
  if not found or settlement.status<>'CONFIRMED' then
    return jsonb_build_object('ok',false,'error','Liquidação ainda não confirmada.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hb_repasse:'||p_cooperative_cnpj||':'||p_mes_referencia,0));
  update public.hb_credit_discount_allocations a set app_pool_status='LIQUIDATED',
    coop_pool_status='LIQUIDATED',settlement_id=p_settlement_id
  from public.hb_credit_receivables r,public.hb_credit_transactions t
  where a.cooperative_cnpj=p_cooperative_cnpj and a.mes_referencia=p_mes_referencia
    and a.partner_id=settlement.partner_id and a.cashback_status='EARNED'
    and a.app_repasse_id is null
    and a.transaction_id=r.transaction_id and r.cooperative_cnpj=p_cooperative_cnpj
    and r.partner_id=settlement.partner_id and r.settlement_id=p_settlement_id and r.status='SETTLED'
    and t.id=a.transaction_id and t.cooperative_cnpj=p_cooperative_cnpj
    and t.partner_id=a.partner_id and t.status='posted' and t.event_type='PAYMENT'
    and (a.settlement_id is null or a.settlement_id=p_settlement_id
      or not exists(select 1 from public.hb_credit_settlements old where old.id=a.settlement_id and old.status='CONFIRMED'))
    and (a.app_pool_status<>'LIQUIDATED' or a.coop_pool_status<>'LIQUIDATED'
      or a.settlement_id is distinct from p_settlement_id);
  get diagnostics changed=row_count;
  select coalesce(sum(a.app_cents),0),coalesce(sum(a.coop_cents),0) into app_total,coop_total
    from public.hb_credit_discount_allocations a
    where a.cooperative_cnpj=p_cooperative_cnpj and a.partner_id=settlement.partner_id
      and a.mes_referencia=p_mes_referencia and a.settlement_id=p_settlement_id and a.cashback_status='EARNED';
  if changed>0 then
    insert into public.hb_credit_audit_log (cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
    values (p_cooperative_cnpj,p_actor_user_id,'DISCOUNT_POOL_LIQUIDATED','settlement',p_settlement_id,
      jsonb_build_object('mes_referencia',p_mes_referencia,'app_cents',app_total,'coop_cents',coop_total));
  end if;
  return jsonb_build_object('ok',true,'app_cents',app_total,'coop_cents',coop_total,'duplicate',changed=0);
end $$;

create or replace function public.hb_credit_confirm_app_repasse(
  p_cooperative_cnpj text,p_mes_referencia text,p_repasse_id text,p_responsavel_user_id text,
  p_responsavel_nome text,p_comprovante_memo text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous public.hb_credit_app_repasse%rowtype;
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
  with selected as materialized (
    select a.id,a.app_cents from public.hb_credit_discount_allocations a
    join public.hb_credit_settlements s on s.id=a.settlement_id
      and s.cooperative_cnpj=a.cooperative_cnpj and s.partner_id=a.partner_id and s.status='CONFIRMED'
    join public.hb_credit_receivables r on r.transaction_id=a.transaction_id
      and r.cooperative_cnpj=a.cooperative_cnpj and r.partner_id=a.partner_id
      and r.settlement_id=s.id and r.status='SETTLED'
    join public.hb_credit_transactions t on t.id=a.transaction_id and t.cooperative_cnpj=a.cooperative_cnpj
      and t.partner_id=a.partner_id and t.status='posted' and t.event_type='PAYMENT'
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
revoke all on function public.hb_credit_liquidate_discount_pool(text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_liquidate_discount_pool(text,text,text,text) to service_role;
revoke all on function public.hb_credit_confirm_app_repasse(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_confirm_app_repasse(text,text,text,text,text,text) to service_role;
