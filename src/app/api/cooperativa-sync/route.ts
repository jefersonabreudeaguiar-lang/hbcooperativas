import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadContratosSync,
  uploadOperacionalSync,
  type ContratosSyncPayload,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";
import { deleteAllNotasForCnpj } from "@/lib/supabase/notasStorage";
import { sanitizarOperacionalSyncPayload } from "@/services/pagamentoIntegridadeService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { markHbStaleBeforeOperacionalUpload } from "@/modules/hb-credit/engine/operationalAuthoritativeCreditBaseChange";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, contratos: null, operacional: null });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, contratos: null, operacional: null });
  }

  const [contratos, operacionalRaw] = await Promise.all([
    fetchContratosSync(supabase, cnpj),
    fetchOperacionalSync(supabase, cnpj),
  ]);

  const operacional = operacionalRaw
    ? operacionalRaw.fullReset === true
      ? operacionalRaw
      : sanitizarOperacionalSyncPayload(operacionalRaw, reconciliarFichaFromNotasConferidas)
    : null;

  return NextResponse.json({ configured: true, contratos, operacional });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada.", configured: false }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.section || !body?.payload) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, {
    requireManagement: true,
    write: true,
    checkSaas: true,
  });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const section = String(body.section);
  if (section === "contratos") {
    const uploaded = await uploadContratosSync(supabase, cnpj, body.payload as ContratosSyncPayload);
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 500 });
    if (guard.session) {
      await logServerMutationAudit(supabase, guard.session, cnpj, {
        action: "editar",
        entityType: "sync_contratos",
        entityId: cnpj,
        summary: "Sync contratos publicado na nuvem (API).",
      });
    }
    return NextResponse.json({ success: true, section }, { status: 201 });
  }

  if (section === "operacional") {
    const existing = await fetchOperacionalSync(supabase, cnpj);
    const raw = body.payload as OperacionalSyncPayload;
    if (existing?.fullReset === true) {
      const prevVer = existing.operationalResetVersion ?? 0;
      const nextVer = raw.operationalResetVersion ?? 0;
      const restoreScriptPublish = raw.fullReset === true && nextVer > prevVer;
      if (!restoreScriptPublish) {
        return NextResponse.json(
          {
            error:
              "A nuvem está com backup restaurado (somente leitura). No app, use Início → Restaurar da nuvem.",
            code: "OPERACIONAL_RESTORE_LOCK",
          },
          { status: 423 }
        );
      }
    }

    const payload = sanitizarOperacionalSyncPayload(raw, reconciliarFichaFromNotasConferidas);
    if (payload.wipeNotas === true) {
      await deleteAllNotasForCnpj(supabase, cnpj);
    }

    const staleGuard = await markHbStaleBeforeOperacionalUpload(supabase, {
      cnpj,
      nextOperacionalSanitized: payload,
      actorUserId: guard.session?.sub ?? "operacional_sync",
      staleReason: "pix_operacional_sync_upload",
      auditSession: guard.session,
    });
    if (!staleGuard.ok) {
      return NextResponse.json(
        { error: staleGuard.error, code: staleGuard.code ?? "HB_STALE_GUARD_FAILED" },
        { status: 503 }
      );
    }

    const uploaded = await uploadOperacionalSync(supabase, cnpj, payload);
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 500 });
    if (guard.session) {
      await logServerMutationAudit(supabase, guard.session, cnpj, {
        action: "editar",
        entityType: "sync_operacional",
        entityId: cnpj,
        summary: "Sync operacional publicado na nuvem (API).",
      });
    }
    return NextResponse.json({ success: true, section }, { status: 201 });
  }

  return NextResponse.json({ error: "Seção desconhecida." }, { status: 400 });
}
