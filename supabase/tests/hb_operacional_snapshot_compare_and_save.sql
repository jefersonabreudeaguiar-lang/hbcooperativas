begin;
do $$
declare
  fixture constant text := '99999999999998';
  initial_revision uuid;
  saved_revision uuid;
begin
  if exists (select 1 from public.hb_operacional_snapshots where cooperativa_cnpj = fixture) then
    raise exception 'Fixture already exists';
  end if;
  if has_function_privilege('anon', 'public.hb_operacional_compare_and_save(text,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.hb_operacional_compare_and_save(text,uuid,jsonb)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.hb_operacional_snapshots', 'SELECT')
    or not has_function_privilege('service_role', 'public.hb_operacional_compare_and_save(text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Unexpected operational snapshot privileges';
  end if;

  initial_revision := public.hb_operacional_compare_and_save(fixture, null, '{"livroCaixa":[]}'::jsonb);
  if initial_revision is null
    or public.hb_operacional_compare_and_save(fixture, null, '{"livroCaixa":[{"id":"wrong-bootstrap"}]}'::jsonb) is not null then
    raise exception 'Bootstrap was not exclusive';
  end if;

  saved_revision := public.hb_operacional_compare_and_save(fixture, initial_revision, '{"livroCaixa":[{"id":"a"}]}'::jsonb);
  if saved_revision is null or saved_revision = initial_revision then
    raise exception 'Current revision did not advance';
  end if;
  if public.hb_operacional_compare_and_save(fixture, initial_revision, '{"livroCaixa":[{"id":"b"}]}'::jsonb) is not null then
    raise exception 'Stale revision overwrote the current snapshot';
  end if;
  if not exists (
    select 1 from public.hb_operacional_snapshots
    where cooperativa_cnpj = fixture and revision = saved_revision
      and payload = '{"livroCaixa":[{"id":"a"}]}'::jsonb
  ) then
    raise exception 'The winning snapshot changed';
  end if;
end;
$$;
rollback;
