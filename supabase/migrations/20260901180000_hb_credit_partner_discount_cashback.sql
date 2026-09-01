-- Desconto contratual por mercado, recebível líquido, pool 70/20/10 e cashback cooperado.

alter table public.hb_credit_partners
  add column if not exists partner_discount_percent numeric(5, 2) not null default 0
  check (partner_discount_percent >= 0 and partner_discount_percent <= 100);

alter table public.hb_credit_transactions
  add column if not exists gross_amount_cents bigint,
  add column if not exists partner_discount_percent numeric(5, 2),
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists net_receivable_cents bigint,
  add column if not exists credit_debited_cents bigint,
  add column if not exists cashback_applied_cents bigint not null default 0;

alter table public.hb_credit_receivables
  add column if not exists gross_amount_cents bigint,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists net_amount_cents bigint;

create table if not exists public.hb_credit_cashback_balances (
  cooperative_cnpj text not null,
  cooperado_id text not null,
  available_cents bigint not null default 0 check (available_cents >= 0),
  lifetime_earned_cents bigint not null default 0,
  lifetime_used_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cooperative_cnpj, cooperado_id)
);

create table if not exists public.hb_credit_discount_allocations (
  id uuid primary key default gen_random_uuid(),
  cooperative_cnpj text not null,
  transaction_id text not null unique references public.hb_credit_transactions (id) on delete cascade,
  cooperado_id text not null,
  partner_id text not null,
  mes_referencia text not null,
  gross_cents bigint not null,
  discount_cents bigint not null,
  net_partner_cents bigint not null,
  cashback_cents bigint not null default 0,
  app_cents bigint not null default 0,
  coop_cents bigint not null default 0,
  cashback_status text not null default 'EARNED',
  app_pool_status text not null default 'PENDING',
  coop_pool_status text not null default 'PENDING',
  settlement_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hb_discount_alloc_coop_mes
  on public.hb_credit_discount_allocations (cooperative_cnpj, mes_referencia);

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

  v_gross := v_intent.amount_cents;
  v_discount_pct := coalesce(v_partner.partner_discount_percent, 0);
  v_discount := round(v_gross * v_discount_pct / 100.0);
  v_net := v_gross - v_discount;
  v_cashback_earn := (v_discount * 70) / 100;
  v_app := (v_discount * 20) / 100;
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
      jsonb_build_object('memo', 'Cashback 70% do desconto do mercado')
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

create or replace function public.hb_credit_refund_payment(
  p_transaction_id text,
  p_cooperative_cnpj text,
  p_refund_transaction_id text,
  p_refund_id text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_tx public.hb_credit_transactions%rowtype;
  v_account public.hb_credit_accounts%rowtype;
  v_existing_refund public.hb_credit_refunds%rowtype;
  v_alloc public.hb_credit_discount_allocations%rowtype;
  v_disponivel bigint;
  v_ledger_id uuid;
  v_credit_restore bigint;
  v_cashback_use bigint;
  v_cashback_earn bigint;
begin
  select * into v_existing_refund from public.hb_credit_refunds
  where original_transaction_id = p_transaction_id
  limit 1;

  if found then
    select * into v_tx from public.hb_credit_transactions
    where id = p_transaction_id and cooperative_cnpj = p_cooperative_cnpj;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Transação não encontrada.');
    end if;

    select * into v_account from public.hb_credit_accounts where id = v_tx.account_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
    end if;

    v_disponivel := v_account.limit_released_cents - v_account.amount_used_cents;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transacao_id', p_transaction_id,
      'disponivel_apos_centavos', v_disponivel
    );
  end if;

  select * into v_tx from public.hb_credit_transactions
  where id = p_transaction_id and cooperative_cnpj = p_cooperative_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Transação não encontrada.');
  end if;

  if v_tx.status <> 'posted' or v_tx.event_type <> 'PAYMENT' then
    return jsonb_build_object('ok', false, 'error', 'Transação não pode ser estornada.');
  end if;

  select * into v_account from public.hb_credit_accounts
  where id = v_tx.account_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  end if;

  v_credit_restore := coalesce(v_tx.credit_debited_cents, v_tx.amount_cents);
  v_cashback_use := coalesce(v_tx.cashback_applied_cents, 0);

  select * into v_alloc from public.hb_credit_discount_allocations where transaction_id = p_transaction_id;
  v_cashback_earn := coalesce(v_alloc.cashback_cents, 0);

  update public.hb_credit_accounts
  set amount_used_cents = greatest(0, amount_used_cents - v_credit_restore),
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_account.id;

  v_disponivel := v_account.limit_released_cents - greatest(0, v_account.amount_used_cents - v_credit_restore);

  if v_cashback_earn > 0 or v_cashback_use > 0 then
    update public.hb_credit_cashback_balances
    set available_cents = greatest(0, available_cents - v_cashback_earn + v_cashback_use),
        lifetime_earned_cents = greatest(0, lifetime_earned_cents - v_cashback_earn),
        lifetime_used_cents = greatest(0, lifetime_used_cents - v_cashback_use),
        updated_at = now()
    where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = v_tx.cooperado_id;

    if not found then
      insert into public.hb_credit_cashback_balances (
        cooperative_cnpj, cooperado_id, available_cents, lifetime_earned_cents, lifetime_used_cents, updated_at
      ) values (
        p_cooperative_cnpj, v_tx.cooperado_id,
        greatest(0, v_cashback_use - v_cashback_earn), 0, 0, now()
      );
    end if;
  end if;

  update public.hb_credit_transactions set status = 'reversed' where id = p_transaction_id;

  if v_tx.payment_intent_id is not null then
    update public.hb_credit_payment_intents
    set status = 'REFUNDED', updated_at = now()
    where id = v_tx.payment_intent_id;
  end if;

  update public.hb_credit_receivables
  set status = 'BLOCKED_FOR_REVIEW', updated_at = now()
  where transaction_id = p_transaction_id;

  if v_alloc.transaction_id is not null then
    update public.hb_credit_discount_allocations
    set cashback_status = 'REVERSED',
        app_pool_status = case when app_pool_status = 'LIQUIDATED' then app_pool_status else 'REVERSED' end,
        coop_pool_status = case when coop_pool_status = 'LIQUIDATED' then coop_pool_status else 'REVERSED' end
    where transaction_id = p_transaction_id;
  end if;

  insert into public.hb_credit_transactions (
    id, cooperative_cnpj, account_id, payment_intent_id, partner_id, cooperado_id,
    event_type, amount_cents, status, idempotency_key,
    gross_amount_cents, credit_debited_cents, cashback_applied_cents
  ) values (
    p_refund_transaction_id, p_cooperative_cnpj, v_account.id, null,
    v_tx.partner_id, v_tx.cooperado_id, 'REFUND', v_tx.amount_cents, 'posted',
    'refund:' || p_transaction_id,
    v_tx.amount_cents, v_credit_restore, v_cashback_use
  );

  insert into public.hb_credit_refunds (
    id, cooperative_cnpj, original_transaction_id, refund_transaction_id, amount_cents, status
  ) values (
    p_refund_id, p_cooperative_cnpj, p_transaction_id, p_refund_transaction_id,
    v_tx.amount_cents, 'posted'
  );

  v_ledger_id := gen_random_uuid();
  insert into public.hb_credit_ledger_entries (
    id, cooperative_cnpj, account_id, transaction_id, entry_type, amount_cents,
    direction, balance_reference_cents, metadata
  ) values (
    v_ledger_id, p_cooperative_cnpj, v_account.id, p_refund_transaction_id, 'REFUND', v_credit_restore,
    'credit', v_disponivel,
    jsonb_build_object(
      'memo', 'Estorno Conta Coop',
      'original_transaction_id', p_transaction_id,
      'payment_intent_id', v_tx.payment_intent_id,
      'gross_cents', v_tx.amount_cents
    )
  );

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'REFUND_CREATED', 'transaction', p_refund_transaction_id,
    jsonb_build_object(
      'original_transaction_id', p_transaction_id,
      'amount_cents', v_tx.amount_cents,
      'credit_restored_cents', v_credit_restore,
      'payment_intent_id', v_tx.payment_intent_id
    )
  );

  return jsonb_build_object('ok', true, 'transacao_id', p_transaction_id, 'disponivel_apos_centavos', v_disponivel);
end;
$$;

create or replace function public.hb_credit_liquidate_discount_pool(
  p_cooperative_cnpj text,
  p_mes_referencia text,
  p_settlement_id text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_app bigint;
  v_coop bigint;
begin
  update public.hb_credit_discount_allocations
  set app_pool_status = 'LIQUIDATED',
      coop_pool_status = 'LIQUIDATED',
      settlement_id = p_settlement_id
  where cooperative_cnpj = p_cooperative_cnpj
    and mes_referencia = p_mes_referencia
    and app_pool_status = 'PENDING'
    and coop_pool_status = 'PENDING'
    and cashback_status = 'EARNED';

  select coalesce(sum(app_cents), 0), coalesce(sum(coop_cents), 0)
  into v_app, v_coop
  from public.hb_credit_discount_allocations
  where settlement_id = p_settlement_id;

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'DISCOUNT_POOL_LIQUIDATED', 'settlement', p_settlement_id,
    jsonb_build_object(
      'mes_referencia', p_mes_referencia,
      'app_cents', v_app,
      'coop_cents', v_coop
    )
  );

  return jsonb_build_object('ok', true, 'app_cents', v_app, 'coop_cents', v_coop);
end;
$$;

create or replace function public.hb_credit_sweep_cashback_to_credit(
  p_cooperative_cnpj text,
  p_mes_referencia text,
  p_actor_user_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_row record;
  v_total bigint := 0;
  v_count int := 0;
  v_disponivel bigint;
  v_ledger_id uuid;
begin
  for v_row in
    select b.cooperado_id, b.available_cents, a.id as account_id, a.limit_released_cents, a.amount_used_cents
    from public.hb_credit_cashback_balances b
    join public.hb_credit_accounts a
      on a.cooperative_cnpj = b.cooperative_cnpj and a.cooperado_id = b.cooperado_id
    where b.cooperative_cnpj = p_cooperative_cnpj
      and b.available_cents > 0
  loop
    update public.hb_credit_accounts
    set limit_released_cents = limit_released_cents + v_row.available_cents,
        updated_at = now(),
        updated_by = p_actor_user_id
    where id = v_row.account_id;

    v_disponivel := v_row.limit_released_cents + v_row.available_cents - v_row.amount_used_cents;

    v_ledger_id := gen_random_uuid();
    insert into public.hb_credit_ledger_entries (
      id, cooperative_cnpj, account_id, entry_type, amount_cents,
      direction, balance_reference_cents, metadata
    ) values (
      v_ledger_id, p_cooperative_cnpj, v_row.account_id, 'CASHBACK_SWEEP', v_row.available_cents,
      'credit', v_disponivel,
      jsonb_build_object('memo', 'Cashback não usado convertido em crédito', 'mes_referencia', p_mes_referencia)
    );

    update public.hb_credit_cashback_balances
    set available_cents = 0, updated_at = now()
    where cooperative_cnpj = p_cooperative_cnpj and cooperado_id = v_row.cooperado_id;

    v_total := v_total + v_row.available_cents;
    v_count := v_count + 1;
  end loop;

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_actor_user_id, 'CASHBACK_SWEPT_TO_CREDIT', 'month', p_mes_referencia,
    jsonb_build_object('total_cents', v_total, 'cooperados', v_count)
  );

  return jsonb_build_object('ok', true, 'total_cents', v_total, 'cooperados', v_count);
end;
$$;
