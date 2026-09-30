-- Fase 2.3 — bloqueio de authorize enquanto limite HB não reflete base financeira authoritative.

alter table public.hb_credit_accounts
  add column if not exists financial_limit_sync_state text not null default 'SYNCED'
    check (financial_limit_sync_state in ('SYNCED', 'STALE', 'SYNC_PENDING', 'SYNC_FAILED')),
  add column if not exists financial_state_version bigint not null default 0 check (financial_state_version >= 0);

comment on column public.hb_credit_accounts.financial_limit_sync_state is
  'SYNCED = limite alinhado ao último sync; STALE/SYNC_* = novo PAYMENT bloqueado até sync bem-sucedido.';
comment on column public.hb_credit_accounts.financial_state_version is
  'Versão monotônica server-side; incrementada quando a base financeira muda antes do sync HB.';

create or replace function public.hb_credit_mark_financial_limit_stale(
  p_cooperative_cnpj text,
  p_cooperado_id text,
  p_actor_user_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.hb_credit_accounts%rowtype;
begin
  update public.hb_credit_accounts
  set financial_limit_sync_state = 'STALE',
      financial_state_version = financial_state_version + 1,
      updated_at = now(),
      updated_by = coalesce(nullif(trim(p_actor_user_id), ''), updated_by)
  where cooperative_cnpj = p_cooperative_cnpj
    and cooperado_id = p_cooperado_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', true, 'updated', false);
  end if;

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj,
    coalesce(nullif(trim(p_actor_user_id), ''), 'system'),
    'HB_LIMIT_SYNC_STALE',
    'account',
    p_cooperado_id,
    jsonb_build_object(
      'reason', coalesce(p_reason, 'financial_base_changed'),
      'financial_state_version', v_row.financial_state_version
    )
  );

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'financial_state_version', v_row.financial_state_version
  );
end;
$$;

create or replace function public.hb_credit_mark_financial_limit_synced(
  p_cooperative_cnpj text,
  p_cooperado_id text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.hb_credit_accounts%rowtype;
begin
  update public.hb_credit_accounts
  set financial_limit_sync_state = 'SYNCED',
      updated_at = now(),
      updated_by = coalesce(nullif(trim(p_actor_user_id), ''), updated_by)
  where cooperative_cnpj = p_cooperative_cnpj
    and cooperado_id = p_cooperado_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', true, 'updated', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'financial_state_version', v_row.financial_state_version
  );
end;
$$;

-- Patch mínimo: recusa PAYMENT se limite potencialmente desatualizado (refund inalterado).
create or replace function public.hb_credit_authorize_payment(
  p_intent_id text,
  p_nonce text,
  p_cooperado_id text,
  p_cooperative_cnpj text,
  p_idempotency_key text,
  p_transaction_id text,
  p_receivable_id text,
  p_receipt_code text,
  p_actor_user_id text,
  p_cashback_applied_cents bigint default 0
)
returns jsonb
language plpgsql
as $$
declare
  v_intent public.hb_credit_payment_intents%rowtype;
  v_account public.hb_credit_accounts%rowtype;
  v_partner public.hb_credit_partners%rowtype;
  v_existing public.hb_credit_transactions%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
  v_gross bigint;
  v_discount_pct numeric(5, 2);
  v_discount bigint;
  v_net bigint;
  v_cashback_earn bigint;
  v_app bigint;
  v_coop bigint;
  v_cashback_bal bigint;
  v_cashback_use bigint;
  v_credit_debit bigint;
  v_mes text;
  v_sync_state text;
begin
  select * into v_existing from public.hb_credit_transactions
  where cooperative_cnpj = p_cooperative_cnpj and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'transacao_id', v_existing.id);
  end if;

  select * into v_intent from public.hb_credit_payment_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cobrança não encontrada.');
  end if;

  if v_intent.cooperative_cnpj <> p_cooperative_cnpj then
    return jsonb_build_object('ok', false, 'error', 'Cooperativa inválida.');
  end if;

  if v_intent.nonce <> p_nonce then
    return jsonb_build_object('ok', false, 'error', 'QR inválido.');
  end if;

  if v_intent.status not in ('PENDING', 'CREATED') then
    return jsonb_build_object('ok', false, 'error', 'Cobrança já utilizada ou encerrada.');
  end if;

  if v_intent.expires_at < now() then
    update public.hb_credit_payment_intents set status = 'EXPIRED', updated_at = now() where id = p_intent_id;
    return jsonb_build_object('ok', false, 'error', 'Cobrança expirada.');
  end if;

  select * into v_partner from public.hb_credit_partners where id = v_intent.partner_id;
  if v_partner.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'error', 'Mercado não autorizado.');
  end if;

  select * into v_account from public.hb_credit_accounts
  where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = p_cooperado_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cooperado sem limite Conta Coop.');
  end if;

  if v_account.status = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'Cooperado bloqueado para pagamentos.');
  end if;

  v_sync_state := coalesce(v_account.financial_limit_sync_state, 'SYNCED');
  if v_sync_state <> 'SYNCED' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'HB_CREDIT_STATE_STALE',
      'error', 'O crédito está sendo atualizado. Aguarde alguns instantes e tente novamente.'
    );
  end if;

  v_gross := v_intent.amount_cents;
  v_discount_pct := coalesce(v_partner.partner_discount_percent, 0);
  v_discount := round(v_gross * v_discount_pct / 100.0);
  v_net := v_gross - v_discount;
  v_cashback_earn := (v_discount * 60) / 100;
  v_app := (v_discount * 30) / 100;
  v_coop := v_discount - v_cashback_earn - v_app;
  v_mes := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');

  v_cashback_use := greatest(0, coalesce(p_cashback_applied_cents, 0));
  if v_cashback_use > v_gross then
    v_cashback_use := v_gross;
  end if;

  select coalesce(available_cents, 0) into v_cashback_bal
  from public.hb_credit_cashback_balances
  where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = p_cooperado_id;

  if not found then
    v_cashback_bal := 0;
  end if;

  if v_cashback_use > v_cashback_bal then
    v_cashback_use := v_cashback_bal;
  end if;

  v_credit_debit := v_gross - v_cashback_use;
  v_disponivel := v_account.limit_released_cents - v_account.amount_used_cents;

  if v_disponivel < v_credit_debit then
    return jsonb_build_object('ok', false, 'error', 'Limite insuficiente.');
  end if;

  update public.hb_credit_accounts
  set amount_used_cents = amount_used_cents + v_credit_debit,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_disponivel - v_credit_debit;

  if v_cashback_earn > 0 or v_cashback_use > 0 then
    insert into public.hb_credit_cashback_balances (
      cooperative_cnpj, cooperado_id, available_cents, lifetime_earned_cents, lifetime_used_cents, updated_at
    ) values (
      p_cooperative_cnpj, p_cooperado_id,
      greatest(0, v_cashback_earn - v_cashback_use),
      v_cashback_earn,
      v_cashback_use,
      now()
    )
    on conflict (cooperative_cnpj, cooperado_id) do update set
      available_cents = public.hb_credit_cashback_balances.available_cents + v_cashback_earn - v_cashback_use,
      lifetime_earned_cents = public.hb_credit_cashback_balances.lifetime_earned_cents + v_cashback_earn,
      lifetime_used_cents = public.hb_credit_cashback_balances.lifetime_used_cents + v_cashback_use,
      updated_at = now();
  end if;

  update public.hb_credit_payment_intents
  set status = 'CONFIRMED', updated_at = now(), confirmed_at = now(), cooperado_id = p_cooperado_id
  where id = p_intent_id;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key, receipt_code,
    gross_amount_cents, partner_discount_percent, discount_cents, net_receivable_cents,
    credit_debited_cents, cashback_applied_cents
  ) values (
    p_transaction_id, p_cooperative_cnpj, v_account.id, p_intent_id, v_intent.partner_id, p_cooperado_id,
    'PAYMENT', v_gross, 'posted', p_idempotency_key, p_receipt_code,
    v_gross, v_discount_pct, v_discount, v_net, v_credit_debit, v_cashback_use
  );

  insert into public.hb_credit_receivables (
    id, cooperative_cnpj, partner_id, transaction_id, amount_cents, status,
    gross_amount_cents, discount_cents, net_amount_cents
  ) values (
    p_receivable_id, p_cooperative_cnpj, v_intent.partner_id, p_transaction_id,
    v_net, 'OPEN', v_gross, v_discount, v_net
  );

  if v_discount > 0 then
    insert into public.hb_credit_discount_allocations (
      cooperative_cnpj, transaction_id, cooperado_id, partner_id, mes_referencia,
      gross_cents, discount_cents, net_partner_cents, cashback_cents, app_cents, coop_cents
    ) values (
      p_cooperative_cnpj, p_transaction_id, p_cooperado_id, v_intent.partner_id, v_mes,
      v_gross, v_discount, v_net, v_cashback_earn, v_app, v_coop
    );
  end if;

  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'PAYMENT', v_credit_debit,
    'debit', v_disponivel,
    jsonb_build_object(
      'memo', coalesce(v_intent.description, 'Pagamento Conta Coop'),
      'gross_cents', v_gross,
      'cashback_applied_cents', v_cashback_use,
      'discount_cents', v_discount,
      'net_partner_cents', v_net
    )
  );

  if v_cashback_use > 0 then
    v_ledger_id := gen_random_uuid();
    insert into public.hb_credit_ledger_entries (
      id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
      direction, balance_reference_cents, metadata
    ) values (
      v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'CASHBACK_USE', v_cashback_use,
      'debit', v_disponivel,
      jsonb_build_object('memo', 'Cashback aplicado no pagamento')
    );
  end if;

  if v_cashback_earn > 0 then
    v_ledger_id := gen_random_uuid();
    insert into public.hb_credit_ledger_entries (
      id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
      direction, balance_reference_cents, metadata
    ) values (
      v_ledger_id, p_cooperative_cnpj, v_account.id, p_transaction_id, 'CASHBACK_EARN', v_cashback_earn,
      'credit', v_disponivel,
      jsonb_build_object('memo', 'Cashback 60% do desconto do mercado')
    );
  end if;

  insert into public.hb_credit_idempotency_records (
    cooperative_cnpj, scope, idempotency_key, result_reference_id
  ) values (
    p_cooperative_cnpj, 'payment_authorize', p_idempotency_key, p_transaction_id
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'PAYMENT_CONFIRMED', 'transaction', p_transaction_id,
    jsonb_build_object(
      'gross_cents', v_gross,
      'credit_debited_cents', v_credit_debit,
      'cashback_applied_cents', v_cashback_use,
      'discount_cents', v_discount,
      'net_partner_cents', v_net,
      'cooperado_id', p_cooperado_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'transacao_id', p_transaction_id,
    'disponivel_apos_centavos', v_disponivel,
    'amount_centavos', v_gross,
    'cashback_applied_cents', v_cashback_use,
    'cashback_earned_cents', v_cashback_earn
  );
end;
$$;
