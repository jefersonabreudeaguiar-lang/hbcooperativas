import { NextResponse } from 'next/server';
import { guardCooperativaApi, requireAdminRole } from '@/lib/security/apiGuard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeCnpj } from '@/utils/cooperativa';
import { fetchCobrancaSaasPlatformSettings } from '@/lib/supabase/platformSettingsStorage';
import { billingData, readBillingMembers } from '@/lib/billing/platformBillingRead';
import { ensureCobrancaPeriodoAtualSaas, getPeriodoCobrancaSaasAberto, confirmarPagamentoCobrancaSaas, rejeitarPagamentoCobrancaSaas, registrarCobrancaSaas, responsavelInformouPagamentoSaas, enviarAvisoBloqueioCobrancaSaas, bloquearTemporarioCobrancaSaas, desbloquearCobrancaSaas } from '@/services/cobrancaSaasService';

export const maxDuration = 60;
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? '')), action = String(body?.action ?? '');
  if (cnpj.length !== 14 || !['informar','confirmar','rejeitar','registrar','avisar','bloquear','desbloquear'].includes(action)) return NextResponse.json({ error: 'Cobrança inválida.' }, { status: 400 });
  if (typeof body.periodoId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.periodoId)) return NextResponse.json({ error: 'Informe o ciclo exato da cobrança.' }, { status: 400 });
  const gate = await guardCooperativaApi(request, cnpj, { requireManagement: true, write: true, checkSaas: false });
  if (!gate.ok) return gate.response;
  if (action !== 'informar') {
    const denied = requireAdminRole(gate.session, gate.enforced);
    if (denied) return denied;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Nuvem indisponível.' }, { status: 503 });
  try {
    const r = await sb.from('cooperativas').select('id,nome,cnpj,cobranca_saas,updated_at').eq('cnpj', cnpj).maybeSingle();
    if (r.error || !r.data) return NextResponse.json({ error: 'Cooperativa indisponível.' }, { status: 503 });
    const [pricing, members] = await Promise.all([fetchCobrancaSaasPlatformSettings(sb, true), readBillingMembers(sb, cnpj)]);
    let data = ensureCobrancaPeriodoAtualSaas(billingData(r.data, members, pricing), String(r.data.id)).data;
    const id = String(r.data.id), cob = data.cooperativas[0].cobrancaSaas;
    if (!cob?.cicloInicioEm) return NextResponse.json({ error: 'Ciclo de cobrança ainda não iniciado.' }, { status: 409 });
    const period = getPeriodoCobrancaSaasAberto(cob);
    if (body.periodoId && body.periodoId !== period.periodoId) return NextResponse.json({ error: 'O ciclo mudou. Atualize a cobrança antes de confirmar.' }, { status: 409 });
    const actor = gate.session?.name ?? 'Plataforma HB';
    let result;
    if (action === 'informar') result = responsavelInformouPagamentoSaas(data, id, actor);
    else if (action === 'confirmar') result = confirmarPagamentoCobrancaSaas(data, id, actor);
    else if (action === 'rejeitar') result = rejeitarPagamentoCobrancaSaas(data, id, actor, String(body.motivo ?? ''));
    else if (action === 'registrar') result = registrarCobrancaSaas(data, id, actor);
    else result = { ok: true, data: action === 'avisar' ? enviarAvisoBloqueioCobrancaSaas(data, id) : action === 'bloquear' ? bloquearTemporarioCobrancaSaas(data, id, actor) : desbloquearCobrancaSaas(data, id) };
    if (!result.ok) return NextResponse.json({ error: 'error' in result ? result.error : 'Ação não disponível.' }, { status: 409 });
    data = result.data;
    const updated = data.cooperativas[0].cobrancaSaas!;
    if (action === 'informar' && r.data.cobranca_saas?.statusMes === 'bloqueado') updated.statusMes = 'bloqueado';
    const saved = await sb.from('cooperativas').update({ cobranca_saas: updated, updated_at: new Date().toISOString() }).eq('id', id).eq('updated_at', r.data.updated_at).select('id').maybeSingle();
    if (saved.error || !saved.data) return NextResponse.json({ error: 'A cobrança mudou em outra sessão. Atualize e tente novamente.' }, { status: 409 });
    return NextResponse.json({ ok: true, cobrancaSaas: updated, periodoId: period.periodoId }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Não foi possível confirmar a cobrança na nuvem.' }, { status: 503 }); }
}
