-- Cooperativas na nuvem — CNPJ visível em qualquer dispositivo
create extension if not exists "pgcrypto";

create table if not exists public.cooperativas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text not null,
  endereco text not null default '',
  telefone text not null default '',
  responsavel text not null default '',
  email text not null,
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  mensalidade_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cooperativas_cnpj_unique unique (cnpj)
);

create index if not exists cooperativas_cnpj_idx on public.cooperativas (cnpj);
create index if not exists cooperativas_status_idx on public.cooperativas (status);

alter table public.cooperativas enable row level security;

-- Leitura pública de cooperativas ativas (consulta de CNPJ no cadastro)
drop policy if exists cooperativas_public_read on public.cooperativas;
create policy cooperativas_public_read on public.cooperativas
  for select
  to anon, authenticated
  using (status = 'ativa');

-- Escrita apenas via service role (API routes Next.js)
drop policy if exists cooperativas_service_write on public.cooperativas;
create policy cooperativas_service_write on public.cooperativas
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_cooperativas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cooperativas_updated_at on public.cooperativas;
create trigger cooperativas_updated_at
  before update on public.cooperativas
  for each row execute function public.set_cooperativas_updated_at();
