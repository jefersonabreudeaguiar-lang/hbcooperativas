-- Homologação: pagamento fictício, sem integração externa; rollback obrigatório.
begin;
set local statement_timeout = '30s';
do $$
declare
  tag text := 'hb_fixture_' || replace(gen_random_uuid()::text, '-', '');
  cnpj text := '99999999999999';
  account uuid;
  result jsonb;
  used bigint;
begin
  if exists (select 1 from public.hb_credit_partners where cooperative_cnpj=cnpj)
     or exists (select 1 from public.hb_credit_accounts where cooperative_cnpj=cnpj) then
    raise exception 'CNPJ reservado já tem dados; teste recusado';
  end if;
  insert into public.hb_credit_partners (id,cooperative_cnpj,partner_cnpj,name,email,status,partner_discount_percent)
  values (tag,cnpj,'11111111111111','Mercado fictício','fixture@example.invalid','ACTIVE',10);
  insert into public.hb_credit_accounts
    (cooperative_cnpj,cooperado_id,limit_released_cents,financial_limit_base_cents,financial_limit_ceiling_cents)
  values (cnpj,tag,10000,20000,10000) returning id into account;
  insert into public.hb_credit_payment_intents
    (id,cooperative_cnpj,partner_id,amount_cents,nonce,expires_at,status)
  values (tag,cnpj,tag,1000,tag,now()+interval '1 hour','PENDING');
  set local role service_role;

  result := public.hb_credit_authorize_payment(tag,tag,tag,'88888888888888',tag,tag,tag,tag,tag,0);
  if coalesce((result->>'ok')::boolean,true) then
    raise exception 'Pagamento de outra cooperativa foi aceito';
  end if;
  result := public.hb_credit_authorize_payment(tag,'wrong_nonce',tag,cnpj,tag,tag,tag,tag,tag,0);
  if coalesce((result->>'ok')::boolean,true) then
    raise exception 'Nonce incorreto foi aceito';
  end if;

  update public.hb_credit_accounts set status='suspended' where id=account;
  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag,0);
  if coalesce((result->>'ok')::boolean,true) then
    raise exception 'Conta suspensa conseguiu pagar';
  end if;
  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag);
  if coalesce((result->>'ok')::boolean,true) then
    raise exception 'Assinatura antiga permitiu pagamento de conta suspensa';
  end if;
  update public.hb_credit_accounts set status='active' where id=account;
  update public.hb_credit_accounts set financial_limit_base_cents=null where id=account;
  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag);
  if coalesce((result->>'ok')::boolean,true) then
    raise exception 'Chamada compatível permitiu pagamento sem snapshot financeiro';
  end if;
  update public.hb_credit_accounts set financial_limit_base_cents=20000 where id=account;

  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag,0);
  if coalesce((result->>'ok')::boolean,false) is not true
     or (result->>'disponivel_apos_centavos')::bigint <> 9000 then
    raise exception 'Pagamento com servidor restrito falhou: %',result;
  end if;
  select amount_used_cents into used from public.hb_credit_accounts where id=account;
  if used <> 1000 then raise exception 'Débito divergente: %',used; end if;
  if not exists (select 1 from public.hb_credit_receivables
    where transaction_id=tag and amount_cents=900 and gross_amount_cents=1000 and discount_cents=100) then
    raise exception 'Recebível líquido não foi gerado corretamente';
  end if;
  if not exists (select 1 from public.hb_credit_discount_allocations where transaction_id=tag
    and cashback_cents=60 and app_cents=30 and coop_cents=10) then
    raise exception 'Distribuição contratual divergente';
  end if;
  result := public.hb_credit_authorize_payment(tag,tag,tag,cnpj,tag,tag,tag,tag,tag,0);
  if coalesce((result->>'duplicate')::boolean,false) is not true then
    raise exception 'Repetição não reconhecida';
  end if;
  select amount_used_cents into used from public.hb_credit_accounts where id=account;
  if used <> 1000 or (select count(*) from public.hb_credit_transactions where id=tag) <> 1 then
    raise exception 'Repetição duplicou débito ou transação';
  end if;
  reset role;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'hb_credit_%'
      and (has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then
    raise exception 'Há rotina financeira com execução pública';
  end if;
end $$;
rollback;
select 'PASS: pagamento e desconto pelo servidor, cooperativa e nonce validados, suspensão e snapshot ausente bloqueados em chamadas atuais e compatíveis, repetição sem débito duplo, execução pública bloqueada; fixtures revertidas' as result;
