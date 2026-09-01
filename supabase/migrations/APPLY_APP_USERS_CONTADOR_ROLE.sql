-- Execute no SQL Editor do Supabase se cadastro de contador falhar com erro de role/check constraint.
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('admin', 'tesoureiro', 'responsavel', 'cooperado', 'parceiro', 'contador'));
