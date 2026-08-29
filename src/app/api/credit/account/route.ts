import { NextResponse } from "next/server";
import {
  getLimiteCooperado,
  hasFinancialPin,
  listLedgerCooperado,
  setFinancialPin,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCooperado, requireCreditCnpj } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  const cooperadoId = String(searchParams.get("cooperadoId") ?? gate.ctx.session?.cooperadoId ?? "");
  const view = searchParams.get("view");

  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denySelf = requireCreditCooperado(gate.ctx, cooperadoId);
  if (denySelf) return denySelf;

  if (view === "ledger") {
    const ledger = await listLedgerCooperado(gate.ctx.supabase, cnpj, cooperadoId);
    return NextResponse.json({ ok: true, ledger });
  }

  const limite = await getLimiteCooperado(gate.ctx.supabase, cnpj, cooperadoId);
  return NextResponse.json({
    ok: true,
    account: limite ?? {
      cooperadoId,
      limiteLiberadoCents: 0,
      valorUsadoCents: 0,
      valorDisponivelCents: 0,
      bloqueado: false,
    },
    updatedAt: limite?.updatedAt ?? null,
    hasPin: limite ? await hasFinancialPin(gate.ctx.supabase, cnpj, cooperadoId) : false,
  });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const cooperadoId = String(body?.cooperadoId ?? gate.ctx.session?.cooperadoId ?? "");

  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denySelf = requireCreditCooperado(gate.ctx, cooperadoId);
  if (denySelf) return denySelf;

  if (action === "set_pin" || action === "change_pin") {
    const pin = String(body?.pin ?? "");
    if (pin.length < FINANCIAL_PIN_MIN_LENGTH || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: `PIN numérico com mínimo ${FINANCIAL_PIN_MIN_LENGTH} dígitos.` }, { status: 400 });
    }
    const result = await setFinancialPin(gate.ctx.supabase, cnpj, cooperadoId, pin);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
