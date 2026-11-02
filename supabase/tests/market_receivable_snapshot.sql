-- Somente homologação. Todas as fixtures são revertidas ao final.
begin;
set local statement_timeout = '30s';
do $$
declare
  tag text := 'hb_fixture_' || replace(gen_random_uuid()::text, '-', '');
  cnpj_a text := '99999999999999';
  cnpj_b text := '88888888888888';
  market_a text;
  market_b text;
  market_c text;
  tx text;
  payload jsonb;
  summary jsonb;
  i integer;
begin
  if exists (select 1 from public.hb_credit_partners where cooperative_cnpj in (cnpj_a, cnpj_b))
     or exists (select 1 from public.hb_credit_transactions where cooperative_cnpj in (cnpj_a, cnpj_b)) then
    raise exception 'CNPJs reservados já têm dados; teste recusado';
  end if;
  market_a := tag || '_market_a';
  market_b := tag || '_market_b';
  market_c := tag || '_market_c';
  insert into public.hb_credit_partners (id, cooperative_cnpj, partner_cnpj, name, email, status)
  values (market_a, cnpj_a, '11111111111111', 'Fixture A', 'a@example.invalid', 'ACTIVE'),
         (market_b, cnpj_a, '22222222222222', 'Fixture B', 'b@example.invalid', 'ACTIVE'),
         (market_c, cnpj_b, '33333333333333', 'Fixture C', 'c@example.invalid', 'ACTIVE');

  for i in 1..27 loop
    tx := tag || '_tx_' || i;
    insert into public.hb_credit_transactions
      (id, cooperative_cnpj, partner_id, event_type, amount_cents, status, idempotency_key)
    values (tx, cnpj_a, market_a, case when i=27 then 'REFUND' else 'PAYMENT' end,
      1000, case when i=26 then 'reversed' else 'posted' end, tx);
    insert into public.hb_credit_receivables
      (id, cooperative_cnpj, partner_id, transaction_id, amount_cents, gross_amount_cents,
       discount_cents, net_amount_cents, status, created_at)
    values (tag || '_r_' || i, cnpj_a, market_a, tx, 1000, 1000, 100, 900,
      case when i<=21 then 'ELIGIBLE' when i=22 then 'OPEN' when i=23 then 'PROCESSING'
           when i=24 then 'BLOCKED_FOR_REVIEW' when i=25 then 'SETTLED' else 'OPEN' end,
      case when i<=10 then '2026-09-01T12:00:00Z'::timestamptz else '2026-10-01T12:00:00Z'::timestamptz end);
  end loop;
  insert into public.hb_credit_transactions
    (id, cooperative_cnpj, partner_id, event_type, amount_cents, idempotency_key)
  values (tag || '_other_market', cnpj_a, market_b, 'PAYMENT', 7000, tag || '_other_market'),
         (tag || '_other_coop', cnpj_b, market_c, 'PAYMENT', 8000, tag || '_other_coop');
  insert into public.hb_credit_receivables
    (id, cooperative_cnpj, partner_id, transaction_id, amount_cents, status)
  values (tag || '_rb', cnpj_a, market_b, tag || '_other_market', 7000, 'ELIGIBLE'),
         (tag || '_rc', cnpj_b, market_c, tag || '_other_coop', 8000, 'ELIGIBLE');
  insert into public.hb_credit_settlements
    (id, cooperative_cnpj, partner_id, mes_referencia, total_cents, status)
  values (tag || '_settlement', cnpj_a, market_a, '2026-10', 900, 'AWAITING_PARTNER');

  set local role service_role;
  payload := public.hb_credit_market_receivable_snapshot(cnpj_a, market_a);
  summary := payload->'summaries'->0;
  if (payload->>'integrityErrors')::int <> 0
     or jsonb_array_length(payload->'summaries') <> 1
     or (summary->>'aReceberCents')::bigint <> 19800
     or (summary->>'totalPendenteCents')::bigint <> 21600
     or (summary->>'liquidadoCents')::bigint <> 900
     or (summary->>'aguardandoConfirmacaoCents')::bigint <> 900
     or (summary->>'quantidadePendente')::int <> 24
     or jsonb_array_length(summary->'porMes') <> 2
     or jsonb_array_length(payload->'recentReceivables') <> 20 then
    raise exception 'Falhou resumo líquido, paginação, pagos, estornos ou isolamento: %', payload;
  end if;
  payload := public.hb_credit_market_receivable_snapshot(cnpj_a, market_c);
  if jsonb_array_length(payload->'summaries') <> 0
     or jsonb_array_length(payload->'recentReceivables') <> 0 then
    raise exception 'Consulta de parceiro de outra cooperativa vazou dados';
  end if;
  payload := public.hb_credit_market_receivable_snapshot(cnpj_a, null);
  if jsonb_array_length(payload->'summaries') <> 2 then
    raise exception 'Resumo do responsável não incluiu todos os mercados da cooperativa';
  end if;
  reset role;

  insert into public.hb_credit_transactions
    (id, cooperative_cnpj, partner_id, event_type, amount_cents, idempotency_key)
  values (tag || '_missing_receivable', cnpj_a, market_a, 'PAYMENT', 1000, tag || '_missing_receivable');
  set local role service_role;
  payload := public.hb_credit_market_receivable_snapshot(cnpj_a, market_a);
  if (payload->>'integrityErrors')::int <> 1 then
    raise exception 'Pagamento sem recebível não sinalizou inconsistência';
  end if;
  reset role;

  if has_function_privilege('anon', 'public.hb_credit_market_receivable_snapshot(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hb_credit_market_receivable_snapshot(text,text)', 'EXECUTE') then
    raise exception 'Rotina financeira exposta diretamente';
  end if;
  set local role anon;
  begin
    perform public.hb_credit_market_receivable_snapshot(cnpj_a, market_a);
    raise exception 'Visitante conseguiu executar a rotina financeira';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
select 'PASS: resumo líquido completo, pagos e estornos separados, isolamento, inconsistência detectada e acesso público negado; fixtures revertidas' as result;
