import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditAction, AuditEntry } from "@/types";

export interface CooperativeAuditRow {
  id: string;
  cooperative_cnpj: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  mes_referencia: string | null;
  summary: string;
  justification: string | null;
  changes: string | null;
  source: string;
  created_at: string;
}

export interface CooperativeAuditInsert {
  id: string;
  cooperativeCnpj: string;
  occurredAt: string;
  actorUserId?: string;
  actorName: string;
  actorRole?: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  mesReferencia?: string;
  summary: string;
  justification?: string;
  changes?: string;
  source?: string;
}

function rowFromInsert(entry: CooperativeAuditInsert): CooperativeAuditRow {
  return {
    id: entry.id,
    cooperative_cnpj: entry.cooperativeCnpj,
    occurred_at: entry.occurredAt,
    actor_user_id: entry.actorUserId ?? null,
    actor_name: entry.actorName,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    mes_referencia: entry.mesReferencia ?? null,
    summary: entry.summary,
    justification: entry.justification ?? null,
    changes: entry.changes ?? null,
    source: entry.source ?? "web",
    created_at: entry.occurredAt,
  };
}

export function auditEntryToCloudInsert(
  entry: AuditEntry,
  cooperativeCnpj: string,
  actorRole?: string,
  mesReferencia?: string
): CooperativeAuditInsert {
  const summary =
    entry.changes?.trim() ||
    `${entry.action} · ${entry.entityType}${entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ""}`;
  return {
    id: entry.id,
    cooperativeCnpj,
    occurredAt: entry.timestamp,
    actorUserId: entry.userId,
    actorName: entry.userName,
    actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    mesReferencia,
    summary,
    justification: entry.justification,
    changes: entry.changes,
    source: "web",
  };
}

export async function insertCooperativeAuditEntries(
  supabase: SupabaseClient,
  entries: CooperativeAuditInsert[]
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  if (entries.length === 0) return { ok: true, inserted: 0 };
  const rows = entries.map(rowFromInsert);
  const { error } = await supabase.from("cooperative_audit_log").upsert(rows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, inserted: rows.length };
}

export async function fetchCooperativeAuditLog(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  opts?: { mesReferencia?: string; limit?: number; offset?: number }
): Promise<CooperativeAuditRow[]> {
  let query = supabase
    .from("cooperative_audit_log")
    .select("*")
    .eq("cooperative_cnpj", cooperativeCnpj)
    .order("occurred_at", { ascending: false });

  if (opts?.mesReferencia) {
    query = query.eq("mes_referencia", opts.mesReferencia);
  }

  const limit = opts?.limit ?? 200;
  const offset = opts?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as CooperativeAuditRow[];
}

export async function checkCooperativeAuditSchema(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("cooperative_audit_log").select("id").limit(1);
  return !error || !/cooperative_audit_log/i.test(error.message ?? "");
}

/** Evidência de confirmação de pagamento pelo cooperado (monotonicidade H8.9.106). */
export type PagamentoConfirmacaoAuditEvidence = {
  pagamentoId: string;
  confirmedAt: string;
};

const PAGAMENTO_CONFIRMACAO_APROVAR =
  /confirmou pagamento(?: e assinou recibo| com assinatura)/i;

/** Não estabelece confirmação inicial — só conferência pós-assinatura. */
const PAGAMENTO_APROVAR_RECIBO_CONFERIDO = /recibo assinado conferido/i;

function isAuditConfirmacaoCooperadoPagamento(row: {
  action: string;
  summary: string;
}): boolean {
  if (row.action !== "aprovar") return false;
  if (PAGAMENTO_APROVAR_RECIBO_CONFERIDO.test(row.summary)) return false;
  return PAGAMENTO_CONFIRMACAO_APROVAR.test(row.summary);
}

/**
 * Consulta em lote eventos de confirmação de pagamento (cooperado).
 * Usado somente quando o payload pode regredir um pagamento já confirmado.
 */
export async function fetchPagamentoConfirmacaoAuditEvidenceBatch(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  pagamentoIds: string[]
): Promise<Map<string, PagamentoConfirmacaoAuditEvidence>> {
  const out = new Map<string, PagamentoConfirmacaoAuditEvidence>();
  const uniqueIds = [...new Set(pagamentoIds.filter(Boolean))];
  if (uniqueIds.length === 0) return out;

  const { data, error } = await supabase
    .from("cooperative_audit_log")
    .select("entity_id, action, summary, occurred_at")
    .eq("cooperative_cnpj", cooperativeCnpj)
    .eq("entity_type", "pagamento")
    .in("entity_id", uniqueIds)
    .order("occurred_at", { ascending: false });

  if (error || !data?.length) return out;

  for (const row of data as {
    entity_id: string;
    action: string;
    summary: string;
    occurred_at: string;
  }[]) {
    const id = row.entity_id;
    if (!id || out.has(id)) continue;
    if (!isAuditConfirmacaoCooperadoPagamento(row)) continue;
    out.set(id, { pagamentoId: id, confirmedAt: row.occurred_at });
  }

  return out;
}
