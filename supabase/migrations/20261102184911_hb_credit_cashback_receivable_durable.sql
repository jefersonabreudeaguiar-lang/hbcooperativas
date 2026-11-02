-- A baixa e o destino a receber passam a existir na mesma transação do banco.
set local lock_timeout = '5s';
create or replace function public.hb_credit_cashback_to_receivable(
  p_cooperative_cnpj text,p_cooperado_id text,p_mes_referencia text,p_actor_user_id text,p_valor_avulso_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  account public.hb_credit_accounts%rowtype;
  previous record;
  amount bigint;
  tx_id text;
  available bigint;
begin
  if coalesce(p_cooperative_cnpj,'') !~ '^\d{14}$'
    or coalesce(p_mes_referencia,'') !~ '^\d{4}-(0[1-9]|1[0-2])$'
    or nullif(trim(p_valor_avulso_id),'') is null or length(p_valor_avulso_id)>160 then
    return jsonb_build_object('ok',false,'error','Dados da conversão inválidos.');
  end if;
  select * into account from public.hb_credit_accounts
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=p_cooperado_id for update;
  if not found then return jsonb_build_object('ok',false,'error','conta_nao_encontrada'); end if;
  tx_id:='cbrec:'||p_cooperative_cnpj||':'||p_valor_avulso_id;
  select l.account_id,l.amount_cents,l.metadata into previous from public.hb_credit_ledger_entries l
    where l.cooperative_cnpj=p_cooperative_cnpj and l.transaction_id=tx_id and l.entry_type='CASHBACK_TO_RECEIVABLE';
  if found then
    if previous.account_id<>account.id or previous.metadata->>'mes_referencia' is distinct from p_mes_referencia then
      return jsonb_build_object('ok',false,'error','Identificador já utilizado em outra conversão.');
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'amount_cents',previous.amount_cents);
  end if;
  select available_cents into amount from public.hb_credit_cashback_balances
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=p_cooperado_id for update;
  if coalesce(amount,0)<=0 then return jsonb_build_object('ok',false,'error','sem_cashback'); end if;
  available:=public.hb_credit_effective_disponivel_cents(account.limit_released_cents,
    account.financial_limit_cap_cents,account.amount_used_cents);
  insert into public.hb_credit_transactions
    (id,cooperative_cnpj,account_id,cooperado_id,event_type,amount_cents,idempotency_key)
  values(tx_id,p_cooperative_cnpj,account.id,p_cooperado_id,'ADJUSTMENT',amount,'cashback_to_receivable:'||p_valor_avulso_id);
  insert into public.hb_credit_ledger_entries
    (cooperative_cnpj,account_id,transaction_id,entry_type,amount_cents,direction,balance_reference_cents,metadata)
  values(p_cooperative_cnpj,account.id,tx_id,'CASHBACK_TO_RECEIVABLE',amount,'debit',available,
    jsonb_build_object('memo','Cashback HB Crédito — valor a receber','mes_referencia',p_mes_referencia,
      'valor_avulso_id',p_valor_avulso_id,'amount_cents',amount));
  update public.hb_credit_cashback_balances set available_cents=0,updated_at=now()
    where cooperative_cnpj=p_cooperative_cnpj and cooperado_id=p_cooperado_id;
  insert into public.hb_credit_audit_log(cooperative_cnpj,actor,action,resource_type,resource_id,metadata)
  values(p_cooperative_cnpj,p_actor_user_id,'CASHBACK_TO_RECEIVABLE','cooperado',p_cooperado_id,
    jsonb_build_object('mes_referencia',p_mes_referencia,'amount_cents',amount,'valor_avulso_id',p_valor_avulso_id));
  return jsonb_build_object('ok',true,'amount_cents',amount,'idempotent',false);
end $$;

-- Leitura sem paginação: o lançamento não depende da cópia operacional do aparelho.
create or replace function public.hb_credit_cashback_receivables_snapshot(p_cnpj text)
returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object('cooperativaId',(select c.id::text from public.cooperativas c where c.cnpj=p_cnpj),
  'entries',coalesce(jsonb_agg(jsonb_build_object('id',l.metadata->>'valor_avulso_id',
    'cooperadoId',a.cooperado_id,'mesReferencia',l.metadata->>'mes_referencia',
    'amountCents',l.amount_cents,'createdAt',l.created_at) order by l.created_at,l.id),'[]'::jsonb))
from public.hb_credit_ledger_entries l
join public.hb_credit_accounts a on a.id=l.account_id and a.cooperative_cnpj=l.cooperative_cnpj
join public.hb_credit_transactions t on t.id=l.transaction_id and t.cooperative_cnpj=l.cooperative_cnpj
  and t.account_id=a.id and t.status='posted'
where l.cooperative_cnpj=p_cnpj and l.entry_type='CASHBACK_TO_RECEIVABLE';
$$;
revoke all on function public.hb_credit_cashback_to_receivable(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_credit_cashback_to_receivable(text,text,text,text,text) to service_role;
revoke all on function public.hb_credit_cashback_receivables_snapshot(text) from public,anon,authenticated;
grant execute on function public.hb_credit_cashback_receivables_snapshot(text) to service_role;
