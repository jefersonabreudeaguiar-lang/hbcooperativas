import { NextResponse } from "next/server";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { getDashboardResumo } from "@/lib/supabase/contaCoopStorage";
import { normalizeCnpj } from "@/utils/cooperativa";

async function loadDashboard(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return { error: gate.response };

  let cnpj = "";
  let creditosBaseCents: Record<string, number> = {};

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
    creditosBaseCents = (body?.creditosBaseCents ?? {}) as Record<string, number>;
  } else {
    const { searchParams } = new URL(request.url);
    cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  }

  if (cnpj.length !== 14) {
    return { error: NextResponse.json({ error: "CNPJ inválido." }, { status: 400 }) };
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return { error: denyCoop };
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return { error: denyStaff };

  const dashboard = await getDashboardResumo(gate.ctx.supabase, cnpj, creditosBaseCents);
  return { dashboard };
}

export async function GET(request: Request) {
  const result = await loadDashboard(request);
  if ("error" in result && result.error) {
    return result.error instanceof NextResponse ? result.error : NextResponse.json({ error: "Erro." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dashboard: result.dashboard });
}

export async function POST(request: Request) {
  const result = await loadDashboard(request);
  if ("error" in result && result.error) {
    return result.error instanceof NextResponse ? result.error : NextResponse.json({ error: "Erro." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dashboard: result.dashboard });
}
