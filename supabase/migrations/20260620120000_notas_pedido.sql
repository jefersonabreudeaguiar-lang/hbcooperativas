-- Entregas com foto — sincroniza cooperado → responsável entre dispositivos
create table if not exists public.notas_pedido (
  id text primary key,
  cooperativa_cnpj text not null,
  cooperado_id text not null,
  cooperado_nome text not null default '',
  status text not null,
  mes_referencia text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notas_pedido_cnpj_idx on public.notas_pedido (cooperativa_cnpj);
create index if not exists notas_pedido_cnpj_status_idx on public.notas_pedido (cooperativa_cnpj, status);

alter table public.notas_pedido enable row level security;

drop policy if exists notas_pedido_service_all on public.notas_pedido;
create policy notas_pedido_service_all on public.notas_pedido
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_notas_pedido_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notas_pedido_updated_at on public.notas_pedido;
create trigger notas_pedido_updated_at
  before update on public.notas_pedido
  for each row execute function public.set_notas_pedido_updated_at();
