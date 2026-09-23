import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { createNotaFotoPartSignedUrl } from "@/lib/supabase/notasStorage";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";

const SIGNED_URL_TTL_SEC = 3600;

/** Retorna URL assinada do Storage — o browser baixa a foto direto do Supabase (economia Vercel egress). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const index = Number(searchParams.get("index"));

  if (cnpj.length !== 14 || !Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const signedUrl = await createNotaFotoPartSignedUrl(supabase, cnpj, id, index, SIGNED_URL_TTL_SEC);
  if (!signedUrl) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  return NextResponse.json(
    { url: signedUrl, expiresIn: SIGNED_URL_TTL_SEC },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    }
  );
}
