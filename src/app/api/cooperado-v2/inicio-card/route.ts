import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireCooperadoV2Api } from "@/lib/cooperado-v2/cooperadoV2ApiAuth";
import { fetchCooperadoV2InicioCardFromCloud } from "@/lib/cooperado-v2/server/cooperadoV2InicioCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem indisponível." }, { status: 503 });
  }

  const gate = await requireCooperadoV2Api(request);
  if (!gate.ok) return gate.response;

  const payload = await fetchCooperadoV2InicioCardFromCloud(gate.ctx.cnpj, gate.ctx.cooperadoId);
  if (!payload) {
    return NextResponse.json({ error: "Não foi possível carregar dados da cooperativa." }, { status: 502 });
  }

  return NextResponse.json(payload);
}
