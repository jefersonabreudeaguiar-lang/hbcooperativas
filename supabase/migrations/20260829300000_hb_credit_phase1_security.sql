-- Fase 1 segurança Conta Coop: RLS settlements + aprovação atômica de estorno

alter table public.hb_credit_settlements enable row level security;

drop policy if exists hb_credit_settlements_service_role on public.hb_credit_settlements;
create policy hb_credit_settlements_service_role on public.hb_credit_settlements
  for all to service_role using (true) with check (true);

create or replace function public.hb_credit_approve_refund_request(
  p_request_id text,
  p_cooperative_cnpj text,
  p_reviewer_user_id text,
  p_review_note text,
  p_refund_transaction_id text,
  p_refund_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_req public.hb_credit_refund_requests%rowtype;
  v_refund jsonb;
begin
  select * into v_req from public.hb_credit_refund_requests
  where id = p_request_id and cooperative_cnpj = p_cooperative_cnpj
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Solicitação não encontrada.');
  end if;

  if v_req.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'error', 'Solicitação já foi analisada.');
  end if;

  v_refund := public.hb_credit_refund_payment(
    v_req.transaction_id,
    p_cooperative_cnpj,
    p_refund_transaction_id,
    p_refund_id,
    p_reviewer_user_id
  );

  if not coalesce((v_refund->>'ok')::boolean, false) then
    return v_refund;
  end if;

  update public.hb_credit_refund_requests
  set status = 'APPROVED',
      reviewed_by_user_id = p_reviewer_user_id,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'disponivel_apos_centavos', (v_refund->>'disponivel_apos_centavos')::bigint
  );
end;
$$;
