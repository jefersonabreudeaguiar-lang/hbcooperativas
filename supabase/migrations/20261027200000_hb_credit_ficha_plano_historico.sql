-- Ciclos anteriores da ficha HB (entregas arquivadas — não exibidas ao cooperado).

alter table public.hb_credit_cooperado_ficha_plano
  add column if not exists historico_ciclos jsonb not null default '[]'::jsonb;

comment on column public.hb_credit_cooperado_ficha_plano.historico_ciclos is
  'Snapshots de entregas 1–5 arquivados; ciclo ativo fica nas colunas entrega_*_cents.';
