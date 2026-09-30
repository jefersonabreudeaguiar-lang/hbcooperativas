-- Cooperado converte saldo de cashback HB em crédito avulso "a receber" na ficha (operacional local + ledger HB).

create or replace function public.hb_credit_cashback_to_receivable(
  p_cooperative_cnpj text,
  p_cooperado_id text,
  p_mes_referencia text,
  p_actor_user_id text,
  p_valor_avulso_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_account_id uuid;
  v_available bigint;
  v_disponivel bigint;
  v_ledger_id uuid;
  v_existing bigint;
begin
  if coalesce(trim(p_valor_avulso_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'valor_avulso_id_obrigatorio');
  end if;

  select (metadata->>'amount_cents')::bigint
  into v_existing
  from public.hb_credit_ledger_entries
  where cooperative_cnpj = p_cooperative_cnpj
    and entry_type = 'CASHBACK_TO_RECEIVABLE'
    and metadata->>'valor_avulso_id' = p_valor_avulso_id
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'amount_cents', v_existing,
      'idempotent', true
    );
  end if;

  select b.available_cents, a.id, a.limit_released_cents - a.amount_used_cents
  into v_available, v_account_id, v_disponivel
  from public.hb_credit_cashback_balances b
  join public.hb_credit_accounts a
    on a.cooperative_cnpj = b.cooperative_cnpj and a.cooperado_id = b.cooperado_id
  where b.cooperative_cnpj = p_cooperative_cnpj
    and b.cooperado_id = p_cooperado_id
  for update of b;

  if v_account_id is null then
    return jsonb_build_object('ok', false, 'error', 'conta_nao_encontrada');
  end if;

  if coalesce(v_available, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'sem_cashback');
  end if;

  update public.hb_credit_cashback_balances
  set available_cents = 0,
      updated_at = now()
  where cooperative_cnpj = p_cooperative_cnpj
    and cooperado_id = p_cooperado_id;

  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id,
    p_cooperative_cnpj,
    v_account_id,
    'CASHBACK_TO_RECEIVABLE',
    v_available,
    'debit',
    v_disponivel,
    jsonb_build_object(
      'memo', 'Cashback HB Crédito — valor a receber',
      'mes_referencia', p_mes_referencia,
      'valor_avulso_id', p_valor_avulso_id,
      'amount_cents', v_available
    )
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj,
    p_actor_user_id,
    'CASHBACK_TO_RECEIVABLE',
    'cooperado',
    p_cooperado_id,
    jsonb_build_object(
      'mes_referencia', p_mes_referencia,
      'amount_cents', v_available,
      'valor_avulso_id', p_valor_avulso_id
    )
  );

  return jsonb_build_object('ok', true, 'amount_cents', v_available);
end;
$$;
