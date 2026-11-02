-- Fonte permanente dos lançamentos automáticos de repasse, em uma única leitura.
create or replace function public.hb_credit_operational_financial_snapshot(p_cnpj text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  cashback jsonb;
  book jsonb;
begin
  if p_cnpj is null or p_cnpj !~ '^\d{14}$' then
    return jsonb_build_object('ok',false);
  end if;
  cashback:=public.hb_credit_cashback_receivables_snapshot(p_cnpj);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'originId',r.livro_caixa_origem_id,'month',r.mes_referencia,
    'amountCents',r.amount_cents,'responsavel',r.responsavel_nome,'paidAt',r.paid_at,
    'date',to_char(r.paid_at at time zone 'America/Sao_Paulo','YYYY-MM-DD')
  ) order by r.paid_at,r.id),'[]'::jsonb) into book
  from public.hb_credit_app_repasse r where r.cooperative_cnpj=p_cnpj;
  return jsonb_build_object('ok',true,'cashback',cashback,
    'book',jsonb_build_object('cooperativaId',cashback->>'cooperativaId','entries',book));
end $$;
revoke all on function public.hb_credit_operational_financial_snapshot(text) from public,anon,authenticated;
grant execute on function public.hb_credit_operational_financial_snapshot(text) to service_role;
