import type { AppData, AuditEntry, User } from "@/types";
import { auditEntryToCloudInsert } from "@/lib/supabase/cooperativeAuditStorage";
import { getCooperativaById, normalizeCnpj } from "@/utils/cooperativa";

const pendingQueue: CooperativeAuditPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

interface CooperativeAuditPayload {
  cnpj: string;
  entries: ReturnType<typeof auditEntryToCloudInsert>[];
}

function resolveCoopCnpj(data: AppData, userId?: string): string | null {
  if (userId) {
    const user = data.users.find((u) => u.id === userId);
    if (user?.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    if (user?.cooperativaId) {
      const coop = getCooperativaById(data, user.cooperativaId);
      if (coop?.cnpj) return normalizeCnpj(coop.cnpj);
    }
  }
  const coop = data.cooperativas[0];
  return coop?.cnpj ? normalizeCnpj(coop.cnpj) : null;
}

function inferMesReferencia(entry: AuditEntry): string | undefined {
  const hay = `${entry.changes ?? ""} ${entry.entityId}`;
  const match = hay.match(/\d{4}-\d{2}/);
  return match?.[0];
}

export function queueAuditEntryForCloud(
  data: AppData,
  entry: AuditEntry,
  actor?: Pick<User, "role">
): void {
  if (typeof window === "undefined") return;
  const cnpj = resolveCoopCnpj(data, entry.userId);
  if (!cnpj || cnpj.length !== 14) return;

  const cloudEntry = auditEntryToCloudInsert(
    entry,
    cnpj,
    actor?.role,
    inferMesReferencia(entry)
  );

  pendingQueue.push({ cnpj, entries: [cloudEntry] });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushAuditQueue(), 800);
}

async function flushAuditQueue(): Promise<void> {
  if (pendingQueue.length === 0) return;
  const batch = pendingQueue.splice(0, pendingQueue.length);
  const byCnpj = new Map<string, ReturnType<typeof auditEntryToCloudInsert>[]>();
  for (const item of batch) {
    const list = byCnpj.get(item.cnpj) ?? [];
    list.push(...item.entries);
    byCnpj.set(item.cnpj, list);
  }

  for (const [cnpj, entries] of byCnpj) {
    try {
      await fetch("/api/cooperativa-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj, entries }),
      });
    } catch {
      /* best-effort — local auditLog permanece */
    }
  }
}

export async function fetchCloudAuditLog(
  cnpj: string,
  opts?: { mesReferencia?: string; limit?: number }
): Promise<
  Array<{
    id: string;
    occurredAt: string;
    actorName: string;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string;
    mesReferencia: string | null;
    summary: string;
    source: string;
  }>
> {
  const params = new URLSearchParams({ cnpj: normalizeCnpj(cnpj) });
  if (opts?.mesReferencia) params.set("mes", opts.mesReferencia);
  if (opts?.limit) params.set("limit", String(opts.limit));

  try {
    const res = await fetch(`/api/cooperativa-audit?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.entries) ? json.entries : [];
  } catch {
    return [];
  }
}

export async function syncLocalAuditToCloud(data: AppData, cnpj: string): Promise<void> {
  const normalized = normalizeCnpj(cnpj);
  if (normalized.length !== 14 || data.auditLog.length === 0) return;

  const entries = data.auditLog.slice(0, 100).map((e) => {
    const user = data.users.find((u) => u.id === e.userId);
    return auditEntryToCloudInsert(e, normalized, user?.role, inferMesReferencia(e));
  });

  try {
    await fetch("/api/cooperativa-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: normalized, entries, bulk: true }),
    });
  } catch {
    /* ignore */
  }
}
