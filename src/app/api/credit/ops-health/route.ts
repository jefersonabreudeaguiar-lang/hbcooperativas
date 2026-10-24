import { NextResponse } from "next/server";
import { buildHbCreditOpsHealth } from "@/lib/hb-credit/security/hbCreditOpsHealth";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Saúde operacional HB — somente responsável/tesoureiro (Fase C). */
export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const staffErr = requireCreditStaff(gate.ctx);
  if (staffErr) return staffErr;

  const url = new URL(request.url);
  const cnpj = normalizeCnpj(url.searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ ok: false, error: "CNPJ inválido." }, { status: 400 });
  }

  const deny = requireCreditCnpj(gate.ctx, cnpj);
  if (deny) return deny;

  const snapshot = await buildHbCreditOpsHealth(gate.ctx.supabase, cnpj);
  return NextResponse.json({ ok: true, snapshot });
}
