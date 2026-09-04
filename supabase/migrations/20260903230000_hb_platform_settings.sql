-- Configurações globais da plataforma HB (cobrança SaaS, etc.)

create table if not exists public.hb_platform_settings (
  id text primary key default 'default',
  cobranca_saas jsonb not null default '{"precoCooperado": 9.9, "minimoMes": 149}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.hb_platform_settings (id)
values ('default')
on conflict (id) do nothing;

comment on table public.hb_platform_settings is
  'Parâmetros globais da plataforma HB — editados pelo painel /admin.';

comment on column public.hb_platform_settings.cobranca_saas is
  'Mensalidade HB: precoCooperado (R$/cooperado/mês) e minimoMes (piso por cooperativa).';

alter table public.hb_platform_settings enable row level security;
