import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import {
  fetchLancamentoHintsSync,
  mergeLancamentoHintsSync,
} from "@/lib/supabase/cooperativaSyncStorage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ at: null, notaId: null });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const cooperadoId = (searchParams.get("cooperadoId") ?? "").trim();
  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "CNPJ ou cooperado inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  if (guard.enforced && guard.session?.role === "cooperado") {
    const sessionCooperadoId = (guard.session.cooperadoId ?? "").trim();
    if (!sessionCooperadoId || sessionCooperadoId !== cooperadoId) {
      return NextResponse.json({ error: "Sem permissão para este cooperado." }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ at: null, notaId: null });
  }

  const payload = await fetchLancamentoHintsSync(supabase, cnpj);
  const mine = payload?.byCooperado?.[cooperadoId];
  return NextResponse.json({
    at: mine?.at ?? null,
    notaId: mine?.notaId ?? null,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    cnpj?: string;
    cooperadoIds?: unknown;
    notaId?: string;
  } | null;

  const cnpj = normalizeCnpj(body?.cnpj ?? "");
  const notaId = typeof body?.notaId === "string" ? body.notaId.trim() : "";
  const cooperadoIds = Array.isArray(body?.cooperadoIds)
    ? [...new Set(body.cooperadoIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean))]
    : [];

  if (cnpj.length !== 14 || !notaId || cooperadoIds.length === 0) {
    return NextResponse.json({ error: "Disparo inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { requireManagement: true, write: true });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const uploaded = await mergeLancamentoHintsSync(
    supabase,
    cnpj,
    cooperadoIds.map((cooperadoId) => ({ cooperadoId, notaId }))
  );
  if (!uploaded.ok) {
    return NextResponse.json({ ok: false, error: uploaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cooperadoIds });
}
