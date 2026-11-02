-- API própria valida perfil, sessão e cooperativa. Rotinas internas não são
-- endpoints públicos. Corpos revisados usam relações e chamadas public.*.
-- Não altera saldos nem reescreve regras de pagamento nesta etapa.
set local lock_timeout = '5s';
do $$
declare
  fn record;
  signature text;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'cooperative_audit_log_deny_mutation', 'hb_credit_approve_refund_request',
      'hb_credit_authorize_payment', 'hb_credit_effective_disponivel_cents',
      'hb_credit_mark_financial_limit_stale', 'hb_credit_mark_financial_limit_synced',
      'hb_credit_refund_payment', 'hb_credit_sync_financial_limit_cap',
      'hb_credit_validate_financial_limit_row', 'set_app_users_updated_at',
      'set_cooperativas_updated_at', 'set_notas_pedido_updated_at'
    )
  loop
    signature := format('%I.%I(%s)', fn.nspname, fn.proname, fn.args);
    execute format('alter function %s set search_path = %L', signature, '');
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;
