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
