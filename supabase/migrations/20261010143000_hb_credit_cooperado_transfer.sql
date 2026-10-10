-- Transferência HB entre cooperados (QR Receber) — domínio isolado do mercado parceiro.

create table if not exists public.hb_credit_cooperado_transfer_intents (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  receiver_cooperado_id text not null,
  payer_cooperado_id text,
  amount_cents bigint not null check (amount_cents > 0),
  description text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  nonce text not null,
  expires_at timestamptz not null,
  idempotency_key text,
  receipt_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists hb_credit_coop_transfer_receiver_status_idx
  on public.hb_credit_cooperado_transfer_intents (cooperative_cnpj, receiver_cooperado_id, status);

create unique index if not exists hb_credit_coop_transfer_idempotency_idx
  on public.hb_credit_cooperado_transfer_intents (cooperative_cnpj, idempotency_key)
  where idempotency_key is not null;

alter table public.hb_credit_cooperado_transfer_intents enable row level security;

create or replace function public.hb_credit_authorize_cooperado_transfer(
  p_intent_id text,
  p_nonce text,
  p_payer_cooperado_id text,
  p_cooperative_cnpj text,
  p_idempotency_key text,
  p_receipt_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.hb_credit_cooperado_transfer_intents%rowtype;
  v_payer public.hb_credit_accounts%rowtype;
  v_receiver public.hb_credit_accounts%rowtype;
  v_amount bigint;
begin
  select * into v_intent
  from public.hb_credit_cooperado_transfer_intents
  where id = p_intent_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cobrança não encontrada.');
  end if;

  if v_intent.cooperative_cnpj <> p_cooperative_cnpj then
    return jsonb_build_object('ok', false, 'error', 'Cooperativa inválida.');
  end if;

  if v_intent.nonce <> p_nonce then
    return jsonb_build_object('ok', false, 'error', 'QR inválido.');
  end if;

  if v_intent.receiver_cooperado_id = p_payer_cooperado_id then
    return jsonb_build_object('ok', false, 'error', 'Você não pode pagar para si mesmo.');
  end if;

  if v_intent.status = 'CONFIRMED' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'receipt_code', v_intent.receipt_code,
      'disponivel_apos_centavos', 0
    );
  end if;

  if v_intent.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'error', 'Cobrança já encerrada.');
  end if;

  if v_intent.expires_at < now() then
    update public.hb_credit_cooperado_transfer_intents
    set status = 'EXPIRED', updated_at = now()
    where id = p_intent_id;
    return jsonb_build_object('ok', false, 'error', 'Cobrança expirada.');
  end if;

  v_amount := v_intent.amount_cents;

  select * into v_payer
  from public.hb_credit_accounts
  where cooperative_cnpj = p_cooperative_cnpj
    and cooperado_id = p_payer_cooperado_id
  for update;

  if not found or v_payer.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Sua conta HB está indisponível.');
  end if;

  if (v_payer.limit_released_cents - v_payer.amount_used_cents) < v_amount then
    return jsonb_build_object('ok', false, 'error', 'Saldo HB insuficiente.');
  end if;

  select * into v_receiver
  from public.hb_credit_accounts
  where cooperative_cnpj = p_cooperative_cnpj
    and cooperado_id = v_intent.receiver_cooperado_id
  for update;

  if not found or v_receiver.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Cooperado destino sem conta HB ativa.');
  end if;

  update public.hb_credit_accounts
  set amount_used_cents = amount_used_cents + v_amount,
      updated_at = now()
  where id = v_payer.id;

  update public.hb_credit_accounts
  set limit_released_cents = limit_released_cents + v_amount,
      updated_at = now()
  where id = v_receiver.id;

  update public.hb_credit_cooperado_transfer_intents
  set status = 'CONFIRMED',
      payer_cooperado_id = p_payer_cooperado_id,
      receipt_code = p_receipt_code,
      confirmed_at = now(),
      updated_at = now()
  where id = p_intent_id;

  select * into v_payer
  from public.hb_credit_accounts
  where id = v_payer.id;

  return jsonb_build_object(
    'ok', true,
    'receipt_code', p_receipt_code,
    'disponivel_apos_centavos', greatest(v_payer.limit_released_cents - v_payer.amount_used_cents, 0)
  );
end;
$$;
