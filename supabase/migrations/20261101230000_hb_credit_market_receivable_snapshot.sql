-- Uma leitura consistente de todos os recebíveis, independente de mês e paginação da tela.
create or replace function public.hb_credit_market_receivable_snapshot(p_cnpj text, p_partner_id text default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with source as (
 select r.id, r.partner_id, r.status, r.created_at,
   coalesce(r.net_amount_cents,r.amount_cents)::bigint net,
   coalesce(r.gross_amount_cents,r.amount_cents)::bigint gross,
   t.status tx_status, t.event_type,
   (p.id is null or t.id is null or t.cooperative_cnpj is distinct from r.cooperative_cnpj
    or t.partner_id is distinct from r.partner_id
    or coalesce(r.net_amount_cents,r.amount_cents) < 0
    or r.status not in ('OPEN','ELIGIBLE','PROCESSING','SETTLED','BLOCKED_FOR_REVIEW','CANCELLED','REFUNDED')) invalid
 from public.hb_credit_receivables r
 left join public.hb_credit_partners p on p.id=r.partner_id and p.cooperative_cnpj=r.cooperative_cnpj
 left join public.hb_credit_transactions t on t.id=r.transaction_id
 where r.cooperative_cnpj=p_cnpj and (p_partner_id is null or r.partner_id=p_partner_id)
), valid as (
 select *, to_char(created_at at time zone 'UTC','YYYY-MM') mes
 from source where not invalid and tx_status='posted' and event_type='PAYMENT'
), totals as (
 select partner_id,
  coalesce(sum(net) filter(where status='OPEN'),0)::bigint aberto,
  coalesce(sum(net) filter(where status='ELIGIBLE'),0)::bigint elegivel,
  coalesce(sum(net) filter(where status='PROCESSING'),0)::bigint processamento,
  coalesce(sum(net) filter(where status='BLOCKED_FOR_REVIEW'),0)::bigint revisao,
  coalesce(sum(net) filter(where status='SETTLED'),0)::bigint liquidado,
  count(*) filter(where status in ('OPEN','ELIGIBLE','PROCESSING','BLOCKED_FOR_REVIEW'))::int pendentes
 from valid group by partner_id
), months as (
 select partner_id,mes,
  coalesce(sum(net) filter(where status in ('OPEN','ELIGIBLE')),0)::bigint receber,
  coalesce(sum(net) filter(where status='PROCESSING'),0)::bigint processamento,
  coalesce(sum(net) filter(where status='BLOCKED_FOR_REVIEW'),0)::bigint revisao
 from valid group by partner_id,mes
), summaries as (
 select p.id, jsonb_build_object(
  'partnerId',p.id,'abertoCents',coalesce(t.aberto,0),'elegivelCents',coalesce(t.elegivel,0),
  'aReceberCents',coalesce(t.aberto,0)+coalesce(t.elegivel,0),
  'emProcessamentoCents',coalesce(t.processamento,0),'emRevisaoCents',coalesce(t.revisao,0),
  'liquidadoCents',coalesce(t.liquidado,0),
  'aguardandoConfirmacaoCents',coalesce((select sum(s.total_cents)::bigint from public.hb_credit_settlements s where s.cooperative_cnpj=p_cnpj and s.partner_id=p.id and s.status='AWAITING_PARTNER'),0),
  'totalPendenteCents',coalesce(t.aberto,0)+coalesce(t.elegivel,0)+coalesce(t.processamento,0)+coalesce(t.revisao,0),
  'quantidadePendente',coalesce(t.pendentes,0),
  'porMes',coalesce((select jsonb_agg(jsonb_build_object('mesReferencia',m.mes,'aReceberCents',m.receber,'emProcessamentoCents',m.processamento,'emRevisaoCents',m.revisao) order by m.mes) from months m where m.partner_id=p.id and m.receber+m.processamento+m.revisao>0),'[]'::jsonb)
 ) resumo
 from public.hb_credit_partners p left join totals t on t.partner_id=p.id
 where p.cooperative_cnpj=p_cnpj and (p_partner_id is null or p.id=p_partner_id)
)
select jsonb_build_object('asOf',now(),'integrityErrors',(select count(*) from source where invalid) + (select count(*) from public.hb_credit_transactions t where t.cooperative_cnpj=p_cnpj and (p_partner_id is null or t.partner_id=p_partner_id) and t.status='posted' and t.event_type='PAYMENT' and not exists(select 1 from public.hb_credit_receivables r where r.transaction_id=t.id and r.cooperative_cnpj=t.cooperative_cnpj and r.partner_id=t.partner_id)),
 'summaries',coalesce((select jsonb_agg(resumo order by id) from summaries),'[]'::jsonb),
 'recentReceivables',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'partnerId',r.partner_id,'amountCents',r.net,'status',r.status,'createdAt',r.created_at) order by r.created_at desc,r.id) from (select * from valid where status in ('OPEN','ELIGIBLE','PROCESSING','BLOCKED_FOR_REVIEW') order by created_at desc,id limit 20) r),'[]'::jsonb));
$$;
revoke all on function public.hb_credit_market_receivable_snapshot(text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_market_receivable_snapshot(text,text) to service_role;
