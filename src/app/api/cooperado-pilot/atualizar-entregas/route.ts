import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireJefersonRebuildPilotApi } from "@/lib/cooperado/jefersonRebuild/jefersonRebuildPilotApiAuth";
import { fetchJefersonRebuildEntregasFromCloud } from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildEntregas";
import {
  isJefersonRebuildServerTimeoutError,
  withJefersonRebuildServerTimeout,
} from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildServerTimeout";

const SERVER_MS = 55_000;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem indisponível." }, { status: 503 });
  }

  const gate = await requireJefersonRebuildPilotApi(request);
  if (!gate.ok) return gate.response;

  try {
    const payload = await withJefersonRebuildServerTimeout(SERVER_MS, () =>
      fetchJefersonRebuildEntregasFromCloud(gate.ctx.cnpj, gate.ctx.cooperadoId, {
        bypassCache: true,
      })
    );
    if (!payload) {
      return NextResponse.json({ error: "Não foi possível atualizar da nuvem." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (isJefersonRebuildServerTimeoutError(e)) {
      return NextResponse.json(
        { error: "A nuvem demorou demais. Tente Atualizar de novo." },
        { status: 504 }
      );
    }
    throw e;
  }
}
