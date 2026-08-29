import { NextResponse } from "next/server";
import { listCooperadoContaCoopDescontosMes } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj } from "@/lib/security/creditGuard";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const cnpj = url.searchParams.get("cnpj") ?? "";
  const cooperadoId = url.searchParams.get("cooperadoId") ?? "";
  const mesReferencia = url.searchParams.get("mesReferencia") ?? "";

  if (!cnpj || !cooperadoId || !mesReferencia) {
    return NextResponse.json({ error: "Informe cnpj, cooperadoId e mesReferencia." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const descontos = await listCooperadoContaCoopDescontosMes(
    gate.ctx.supabase,
    cnpj,
    cooperadoId,
    mesReferencia
  );

  return NextResponse.json({ ok: true, descontos });
}
