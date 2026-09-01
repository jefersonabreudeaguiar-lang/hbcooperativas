-- Mercados parceiros (Conta Coop) — cadastro público /api/auth/register-parceiro
-- Execute no Supabase SQL Editor se o cadastro de mercado falhar.

create table if not exists public.hb_credit_partners (
  id text primary key,
  cooperative_cnpj text not null check (char_length(cooperative_cnpj) = 14),
  partner_cnpj text not null check (char_length(partner_cnpj) = 14),
  name text not null,
  email text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hb_credit_partners_coop_cnpj_unique unique (cooperative_cnpj, partner_cnpj)
);

create index if not exists hb_credit_partners_coop_status_idx
  on public.hb_credit_partners (cooperative_cnpj, status);

create index if not exists hb_credit_partners_coop_idx
  on public.hb_credit_partners (cooperative_cnpj);

alter table public.hb_credit_partners add column if not exists app_user_id text;
create index if not exists hb_credit_partners_app_user_idx on public.hb_credit_partners (app_user_id);

alter table public.app_users add column if not exists parceiro_id text;
create index if not exists app_users_parceiro_idx on public.app_users (parceiro_id);

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro', 'contador'));

alter table public.hb_credit_partners enable row level security;
