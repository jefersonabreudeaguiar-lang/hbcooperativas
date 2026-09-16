import { NextResponse } from "next/server";
import { repairOperacionalContaCoopDescontosCooperativa } from "@/lib/hb-credit/repairOperacionalContaCoopDescontos";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

function authorizeCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export const dynamic = "force-dynamic";

/** Alinha contaCoopDescontos no operacional.json com transações HB (cron diário). */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente indisponível." }, { status: 503 });
  }

  const url = new URL(request.url);
  const cnpj =
    url.searchParams.get("cnpj")?.replace(/\D/g, "") ||
    process.env.HB_RECONCILIATION_COOP_CNPJ?.replace(/\D/g, "") ||
    process.env.HB_HOBELISCO_PROBE_COOP_CNPJ?.replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json(
      { ok: false, error: "Informe ?cnpj= ou HB_RECONCILIATION_COOP_CNPJ no ambiente." },
      { status: 400 }
    );
  }

  try {
    const result = await repairOperacionalContaCoopDescontosCooperativa(supabase, cnpj);
    return NextResponse.json({ ok: true, cnpj, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "repair_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
