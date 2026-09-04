import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  buildCooperativaAberturaResumo,
  buildLevantamentoAberturasApp,
  type LevantamentoAberturasApp,
} from "@/services/cooperadoAppUsageService";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Supabase não configurado.",
      levantamento: buildLevantamentoAberturasApp([]),
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      error: "Cliente Supabase indisponível.",
      levantamento: buildLevantamentoAberturasApp([]),
    });
  }

  const { data: cooperativas, error } = await supabase
    .from("cooperativas")
    .select("id, nome, cnpj, status")
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      levantamento: buildLevantamentoAberturasApp([]),
    });
  }

  const grupos = [];
  for (const row of cooperativas ?? []) {
    const cnpj = normalizeCnpj(String(row.cnpj ?? ""));
    if (cnpj.length !== 14) continue;
    const cooperados = await fetchCooperadosFromStorage(supabase, cnpj);
    grupos.push(
      buildCooperativaAberturaResumo(cooperados, {
        cooperativaId: String(row.id),
        cooperativaNome: String(row.nome ?? ""),
        cooperativaCnpj: cnpj,
      })
    );
  }

  const levantamento: LevantamentoAberturasApp = buildLevantamentoAberturasApp(grupos);

  return NextResponse.json({
    ok: true,
    levantamento,
  });
}
