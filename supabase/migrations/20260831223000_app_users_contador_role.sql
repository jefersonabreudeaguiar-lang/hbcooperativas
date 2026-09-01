-- Restaura papel contador em app_users (removido acidentalmente na migration HB Credit).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_users'
  ) then
    alter table public.app_users drop constraint if exists app_users_role_check;
    alter table public.app_users add constraint app_users_role_check
      check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro', 'contador'));
  end if;
end $$;
