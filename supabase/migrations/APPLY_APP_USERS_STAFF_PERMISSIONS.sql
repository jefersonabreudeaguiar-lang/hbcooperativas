-- Permissões de equipe na nuvem (responsável principal, módulos, função)
alter table public.app_users
  add column if not exists funcao text,
  add column if not exists responsavel_principal boolean not null default false,
  add column if not exists modo_acesso text not null default 'total'
    check (modo_acesso in ('total', 'parcial')),
  add column if not exists permissoes_extras jsonb,
  add column if not exists permissoes_negadas jsonb;

comment on column public.app_users.responsavel_principal is 'Conta principal da cooperativa — gerencia equipe';
comment on column public.app_users.modo_acesso is 'total = matriz da função; parcial = só permissoes_extras';
comment on column public.app_users.permissoes_extras is 'Módulos liberados quando modo_acesso = parcial';
comment on column public.app_users.permissoes_negadas is 'Ações negadas sobre a matriz quando modo_acesso = total';

with ranked as (
  select
    id,
    row_number() over (
      partition by cooperativa_cnpj
      order by created_at asc, id asc
    ) as rn
  from public.app_users
  where role = 'responsavel'
    and active = true
    and cooperativa_cnpj is not null
    and length(trim(cooperativa_cnpj)) = 14
)
update public.app_users u
set responsavel_principal = true
from ranked r
where u.id = r.id
  and r.rn = 1
  and coalesce(u.responsavel_principal, false) = false;
