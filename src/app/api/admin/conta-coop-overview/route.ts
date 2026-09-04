import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  buildContaCoopPlatformOverview,
  defaultMesReferenciaContaCoopAdmin,
  type ContaCoopPlatformOverview,
} from "@/services/platformContaCoopAdminService";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const url = new URL(request.url);
  const mesReferencia = url.searchParams.get("mes")?.trim() || defaultMesReferenciaContaCoopAdmin();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Supabase não configurado.",
      overview: buildContaCoopPlatformOverview({
        mesReferencia,
        cooperativas: [],
        allocations: [],
        partners: [],
        repasses: [],
      }),
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      error: "Cliente Supabase indisponível.",
      overview: buildContaCoopPlatformOverview({
        mesReferencia,
        cooperativas: [],
        allocations: [],
        partners: [],
        repasses: [],
      }),
    });
  }

  const { data: cooperativas, error: coopError } = await supabase
    .from("cooperativas")
    .select("id, nome, cnpj")
    .order("nome", { ascending: true });

  if (coopError) {
    return NextResponse.json({
      ok: false,
      error: coopError.message,
      overview: buildContaCoopPlatformOverview({
        mesReferencia,
        cooperativas: [],
        allocations: [],
        partners: [],
        repasses: [],
      }),
    });
  }

  const [{ data: allocations, error: allocError }, { data: partners, error: partnersError }, { data: repasses, error: repasseError }] =
    await Promise.all([
      supabase
        .from("hb_credit_discount_allocations")
        .select(
          "cooperative_cnpj, gross_cents, discount_cents, net_partner_cents, cashback_cents, app_cents, coop_cents, app_pool_status, coop_pool_status, app_repasse_id, cashback_status"
        )
        .eq("mes_referencia", mesReferencia)
        .neq("cashback_status", "REVERSED"),
      supabase.from("hb_credit_partners").select("cooperative_cnpj, status, name"),
      supabase
        .from("hb_credit_app_repasse")
        .select("cooperative_cnpj, amount_cents, responsavel_nome, paid_at, created_at, comprovante_memo")
        .eq("mes_referencia", mesReferencia),
    ]);

  const warnings: string[] = [];
  if (allocError) warnings.push(`Alocações: ${allocError.message}`);
  if (partnersError) warnings.push(`Mercados: ${partnersError.message}`);
  if (repasseError) warnings.push(`Repasses: ${repasseError.message}`);

  const overview: ContaCoopPlatformOverview = buildContaCoopPlatformOverview({
    mesReferencia,
    cooperativas: (cooperativas ?? []).map((row) => ({
      id: String(row.id),
      nome: String(row.nome ?? ""),
      cnpj: String(row.cnpj ?? ""),
    })),
    allocations: allocations ?? [],
    partners: partners ?? [],
    repasses: repasses ?? [],
  });

  return NextResponse.json({
    ok: true,
    overview,
    warning: warnings.length ? warnings.join(" · ") : undefined,
  });
}
