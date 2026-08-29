import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import {
  fetchCooperativeAuditLog,
  insertCooperativeAuditEntries,
  type CooperativeAuditInsert,
} from "@/lib/supabase/cooperativeAuditStorage";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, entries: [] });
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
    return NextResponse.json({ configured: false, entries: [] });
  }

  const mes = searchParams.get("mes") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
  const offset = Number(searchParams.get("offset") ?? 0);

  const rows = await fetchCooperativeAuditLog(supabase, cnpj, { mesReferencia: mes, limit, offset });

  return NextResponse.json({
    configured: true,
    entries: rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      mesReferencia: r.mes_referencia,
      summary: r.summary,
      source: r.source,
    })),
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Nuvem não configurada." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { requireManagement: true });
  if (!guard.ok) return guard.response;

  const rawEntries = body?.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return NextResponse.json({ error: "Nenhuma entrada informada." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const entries: CooperativeAuditInsert[] = rawEntries.slice(0, 100).map((e: Record<string, unknown>) => ({
    id: String(e.id ?? `audit_${Date.now()}`),
    cooperativeCnpj: cnpj,
    occurredAt: String(e.occurredAt ?? e.occurred_at ?? new Date().toISOString()),
    actorUserId: e.actorUserId ? String(e.actorUserId) : undefined,
    actorName: String(e.actorName ?? e.actor_name ?? "Sistema"),
    actorRole: e.actorRole ? String(e.actorRole) : undefined,
    action: String(e.action ?? "editar"),
    entityType: String(e.entityType ?? e.entity_type ?? "geral"),
    entityId: String(e.entityId ?? e.entity_id ?? ""),
    mesReferencia: e.mesReferencia ? String(e.mesReferencia) : undefined,
    summary: String(e.summary ?? ""),
    justification: e.justification ? String(e.justification) : undefined,
    changes: e.changes ? String(e.changes) : undefined,
    source: String(e.source ?? "web"),
  }));

  const result = await insertCooperativeAuditEntries(supabase, entries);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: result.inserted });
}
