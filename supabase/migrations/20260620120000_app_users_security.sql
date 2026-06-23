-- Usuários autenticados na nuvem (hash bcrypt, JWT validado nas API routes)
create table if not exists public.app_users (
  id text primary key,
  email text not null,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado')),
  cooperativa_id text,
  cooperado_id text,
  cooperativa_cnpj text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_unique unique (email)
);

create index if not exists app_users_email_lower_idx on public.app_users (lower(email));
create index if not exists app_users_coop_cnpj_idx on public.app_users (cooperativa_cnpj);

alter table public.app_users enable row level security;

drop policy if exists app_users_service_only on public.app_users;
create policy app_users_service_only on public.app_users
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_app_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_updated_at on public.app_users;
create trigger app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_app_users_updated_at();

-- Trilha de auditoria server-side (ações sensíveis)
create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id text,
  user_email text,
  cooperativa_cnpj text,
  ip text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_log_created_idx on public.security_audit_log (created_at desc);

alter table public.security_audit_log enable row level security;

drop policy if exists security_audit_service_only on public.security_audit_log;
create policy security_audit_service_only on public.security_audit_log
  for all
  to service_role
  using (true)
  with check (true);
