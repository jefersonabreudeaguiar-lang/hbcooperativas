alter table public.hb_operacional_snapshots
  add column writes_frozen boolean not null default false;

create function public.hb_operacional_freeze_for_rollback(
  p_cnpj text,
  p_expected_revision uuid
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  update public.hb_operacional_snapshots
  set writes_frozen = true
  where cooperativa_cnpj = p_cnpj and revision = p_expected_revision
  returning revision;
$$;

revoke all on function public.hb_operacional_freeze_for_rollback(text, uuid) from public, anon, authenticated;
grant execute on function public.hb_operacional_freeze_for_rollback(text, uuid) to service_role;

create or replace function public.hb_operacional_compare_and_save(
  p_cnpj text,
  p_expected_revision uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision uuid;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid operational snapshot' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 50 * 1024 * 1024 then
    raise exception 'Operational snapshot exceeds the storage limit' using errcode = '22023';
  end if;

  if p_expected_revision is null then
    insert into public.hb_operacional_snapshots (cooperativa_cnpj, revision, payload)
    values (p_cnpj, gen_random_uuid(), p_payload)
    on conflict (cooperativa_cnpj) do nothing
    returning revision into v_revision;
  else
    update public.hb_operacional_snapshots
    set revision = gen_random_uuid(), payload = p_payload, written_at = statement_timestamp()
    where cooperativa_cnpj = p_cnpj and revision = p_expected_revision and not writes_frozen
    returning revision into v_revision;
  end if;
  return v_revision;
end;
$$;
