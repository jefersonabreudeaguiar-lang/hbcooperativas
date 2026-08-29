-- Trilha de auditoria cooperativa (append-only, nuvem)

create table if not exists public.cooperative_audit_log (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  occurred_at timestamptz not null default now(),
  actor_user_id text,
  actor_name text not null default '',
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  mes_referencia text,
  summary text not null default '',
  justification text,
  changes text,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index if not exists cooperative_audit_log_cnpj_occurred_idx
  on public.cooperative_audit_log (cooperative_cnpj, occurred_at desc);

create index if not exists cooperative_audit_log_cnpj_mes_idx
  on public.cooperative_audit_log (cooperative_cnpj, mes_referencia desc)
  where mes_referencia is not null;

create index if not exists cooperative_audit_log_entity_idx
  on public.cooperative_audit_log (cooperative_cnpj, entity_type, entity_id);

alter table public.cooperative_audit_log enable row level security;

create policy cooperative_audit_log_service_role
  on public.cooperative_audit_log
  for all
  to service_role
  using (true)
  with check (true);
