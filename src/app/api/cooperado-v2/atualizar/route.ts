import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireCooperadoV2Api } from "@/lib/cooperado-v2/cooperadoV2ApiAuth";
import { fetchCooperadoV2InicioCardFromCloud } from "@/lib/cooperado-v2/server/cooperadoV2InicioCard";
import {
  isCooperadoV2ServerTimeoutError,
  withCooperadoV2ServerTimeout,
} from "@/lib/cooperado-v2/server/cooperadoV2ServerTimeout";

const INICIO_CARD_SERVER_MS = 50_000;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/** Atualizar v2 = nova leitura na nuvem (sem parse localStorage). */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem indisponível." }, { status: 503 });
  }

  const gate = await requireCooperadoV2Api(request);
  if (!gate.ok) return gate.response;

  try {
    const payload = await withCooperadoV2ServerTimeout(INICIO_CARD_SERVER_MS, () =>
      fetchCooperadoV2InicioCardFromCloud(gate.ctx.cnpj, gate.ctx.cooperadoId, {
        bypassCache: true,
      })
    );
    if (!payload) {
      return NextResponse.json({ error: "Não foi possível atualizar da nuvem." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (isCooperadoV2ServerTimeoutError(e)) {
      return NextResponse.json(
        { error: "A nuvem demorou demais. Toque em Atualizar em instantes." },
        { status: 504 }
      );
    }
    throw e;
  }
}
