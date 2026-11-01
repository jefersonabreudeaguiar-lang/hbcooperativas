import { NextResponse } from "next/server";
import { requireApiAuth, requireCooperativaAccess } from "@/lib/security/apiGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { fetchCooperadoFinanceiroRemoto } from "@/lib/cooperado/server/cooperadoFinanceiroRemoto";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!auth.enforced || !auth.session || auth.session.role !== "cooperado" || !auth.session.cooperadoId) {
    return NextResponse.json({ error: "Sessão de cooperado obrigatória." }, { status: 403 });
  }
  const cnpj = normalizeCnpj(auth.session.cooperativaCnpj ?? "");
  if (cnpj.length !== 14) return NextResponse.json({ error: "Cooperativa inválida." }, { status: 400 });
  const denied = requireCooperativaAccess(auth.session, cnpj, true, request);
  if (denied) return denied;
  try {
    const payload = await fetchCooperadoFinanceiroRemoto(cnpj, auth.session.cooperadoId);
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o financeiro agora." }, { status: 503 });
  }
}
