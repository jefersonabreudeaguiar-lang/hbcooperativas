-- Ficha HB V2: entregas 1–5, desconto %, mensalidades (responsável); espelho para cooperado.

create table if not exists public.hb_credit_cooperado_ficha_plano (
  cooperative_cnpj text not null,
  cooperado_id text not null,
  entrega_1_cents bigint not null default 0,
  entrega_2_cents bigint not null default 0,
  entrega_3_cents bigint not null default 0,
  entrega_4_cents bigint not null default 0,
  entrega_5_cents bigint not null default 0,
  desconto_percent numeric(5, 2) not null default 0,
  mensalidades jsonb not null default '[]'::jsonb,
  entregas_consumidas int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (cooperative_cnpj, cooperado_id),
  constraint hb_credit_ficha_plano_desconto_check check (desconto_percent >= 0 and desconto_percent <= 100),
  constraint hb_credit_ficha_plano_entrega_check check (
    entrega_1_cents >= 0 and entrega_2_cents >= 0 and entrega_3_cents >= 0
    and entrega_4_cents >= 0 and entrega_5_cents >= 0
  )
);

create index if not exists hb_credit_ficha_plano_coop_idx
  on public.hb_credit_cooperado_ficha_plano (cooperative_cnpj);

comment on table public.hb_credit_cooperado_ficha_plano is
  'Plano da ficha HB por cooperado (V2): valores por entrega 1–5, desconto e mensalidades.';
