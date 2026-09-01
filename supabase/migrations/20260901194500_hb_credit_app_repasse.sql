-- Repasse mensal dos 20% do desconto Conta Coop à plataforma HB (PIX + livro caixa).

alter table public.hb_credit_discount_allocations
  add column if not exists app_repasse_id text null;

create index if not exists idx_hb_discount_alloc_app_repasse
  on public.hb_credit_discount_allocations (cooperative_cnpj, mes_referencia, app_repasse_id);

create table if not exists public.hb_credit_app_repasse (
  id text primary key,
  cooperative_cnpj text not null,
  mes_referencia text not null,
  amount_cents bigint not null check (amount_cents > 0),
  responsavel_user_id text not null,
  responsavel_nome text not null,
  comprovante_memo text null,
  livro_caixa_origem_id text not null unique,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (cooperative_cnpj, mes_referencia)
);

create index if not exists idx_hb_app_repasse_coop_mes
  on public.hb_credit_app_repasse (cooperative_cnpj, mes_referencia);

create or replace function public.hb_credit_confirm_app_repasse(
  p_cooperative_cnpj text,
  p_mes_referencia text,
  p_repasse_id text,
  p_responsavel_user_id text,
  p_responsavel_nome text,
  p_comprovante_memo text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_amount bigint;
  v_count int;
  v_livro_id text;
begin
  if exists (
    select 1 from public.hb_credit_app_repasse
    where cooperative_cnpj = p_cooperative_cnpj and mes_referencia = p_mes_referencia
  ) then
    return jsonb_build_object('ok', false, 'error', 'Repasse ao aplicativo já confirmado neste mês.');
  end if;

  select coalesce(sum(app_cents), 0), count(*)
  into v_amount, v_count
  from public.hb_credit_discount_allocations
  where cooperative_cnpj = p_cooperative_cnpj
    and mes_referencia = p_mes_referencia
    and app_pool_status = 'LIQUIDATED'
    and app_repasse_id is null
    and cashback_status <> 'REVERSED'
    and app_cents > 0;

  if v_amount <= 0 or v_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Não há repasse pendente ao aplicativo. Liquide os mercados na aba Liquidar antes de pagar os 20%.'
    );
  end if;

  v_livro_id := 'hb_app_' || p_repasse_id;

  insert into public.hb_credit_app_repasse (
    id, cooperative_cnpj, mes_referencia, amount_cents,
    responsavel_user_id, responsavel_nome, comprovante_memo, livro_caixa_origem_id
  ) values (
    p_repasse_id, p_cooperative_cnpj, p_mes_referencia, v_amount,
    p_responsavel_user_id, p_responsavel_nome, nullif(trim(p_comprovante_memo), ''), v_livro_id
  );

  update public.hb_credit_discount_allocations
  set app_repasse_id = p_repasse_id
  where cooperative_cnpj = p_cooperative_cnpj
    and mes_referencia = p_mes_referencia
    and app_pool_status = 'LIQUIDATED'
    and app_repasse_id is null
    and cashback_status <> 'REVERSED'
    and app_cents > 0;

  insert into public.hb_credit_audit_log (
    cooperative_cnpj, actor, action, resource_type, resource_id, metadata
  ) values (
    p_cooperative_cnpj, p_responsavel_user_id, 'APP_REPASSE_CONFIRMED', 'app_repasse', p_repasse_id,
    jsonb_build_object(
      'mes_referencia', p_mes_referencia,
      'amount_cents', v_amount,
      'alloc_count', v_count,
      'livro_caixa_origem_id', v_livro_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'repasse_id', p_repasse_id,
    'amount_cents', v_amount,
    'alloc_count', v_count,
    'livro_caixa_origem_id', v_livro_id
  );
end;
$$;
