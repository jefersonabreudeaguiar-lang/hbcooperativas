begin;
do $$
declare
  cnpj constant text := '99999999999996';
  latest constant jsonb := '{"livroCaixa":[{"id":"novo","valor":25}],"pagamentosCooperado":[{"id":"pix","status":"confirmado"}]}'::jsonb;
  v1 uuid;
  v2 uuid;
begin
  if has_function_privilege('anon','public.hb_operacional_freeze_for_rollback(text,uuid)','execute') or
    has_function_privilege('authenticated','public.hb_operacional_freeze_for_rollback(text,uuid)','execute') then
    raise exception 'Freeze exposed outside the server';
  end if;
  v1 := public.hb_operacional_compare_and_save(cnpj,null,'{}'::jsonb);
  if v1 is null then raise exception 'Fixture already exists'; end if;
  v2 := public.hb_operacional_compare_and_save(cnpj,v1,latest);
  if v2 is null then raise exception 'Second revision not saved'; end if;
  if public.hb_operacional_freeze_for_rollback(cnpj,v1) is not null then
    raise exception 'A stale revision froze a newer revision';
  end if;
  if public.hb_operacional_freeze_for_rollback(cnpj,v2) is distinct from v2 then
    raise exception 'Current revision was not frozen';
  end if;
  if public.hb_operacional_compare_and_save(cnpj,v2,'{"unexpected":true}'::jsonb) is not null then
    raise exception 'Write bypassed freeze';
  end if;
  if not exists (select 1 from public.hb_operacional_snapshots
     where cooperativa_cnpj=cnpj and revision=v2 and writes_frozen and payload=latest) then
    raise exception 'Frozen copy differs from latest saved data';
  end if;
end;
$$;
rollback;
