-- Fase 2: RLS mínima cooperativas + trilha de auditoria append-only

-- Remove leitura pública da tabela completa (e-mail, responsável, config)
drop policy if exists cooperativas_public_read on public.cooperativas;

create or replace view public.cooperativas_lookup_public
with (security_invoker = on)
as
select id, nome, cnpj, status
from public.cooperativas
where status = 'ativa';

grant select on public.cooperativas_lookup_public to anon, authenticated;

-- Append-only: bloqueia UPDATE/DELETE na trilha (INSERT via service role / API)
create or replace function public.cooperative_audit_log_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cooperative_audit_log is append-only';
end;
$$;

drop trigger if exists cooperative_audit_log_no_mutation on public.cooperative_audit_log;
create trigger cooperative_audit_log_no_mutation
  before update or delete on public.cooperative_audit_log
  for each row execute function public.cooperative_audit_log_deny_mutation();
