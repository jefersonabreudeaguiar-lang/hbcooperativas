-- Evita sucesso falso após falha parcial na confirmação dos recebíveis.
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
  if exists(select 1 from public.hb_credit_receivables r where r.settlement_id=p_settlement_id
    and (r.cooperative_cnpj is distinct from p_cooperative_cnpj or r.partner_id is distinct from settlement.partner_id or r.status<>'SETTLED')) then
    return jsonb_build_object('ok',false,'error','Recebíveis desta liquidação ainda precisam ser concluídos.');
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


revoke all on function public.hb_credit_liquidate_discount_pool(text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_liquidate_discount_pool(text,text,text,text) to service_role;
