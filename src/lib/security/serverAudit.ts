import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionClaims } from "@/lib/security/jwt";
import { insertCooperativeAuditEntries } from "@/lib/supabase/cooperativeAuditStorage";

export async function logServerMutationAudit(
  supabase: SupabaseClient,
  session: SessionClaims,
  cnpj: string,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    mesReferencia?: string;
  }
): Promise<void> {
  try {
    await insertCooperativeAuditEntries(supabase, [
      {
        id: `audit_api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        cooperativeCnpj: cnpj,
        occurredAt: new Date().toISOString(),
        actorUserId: session.sub,
        actorName: session.name,
        actorRole: session.role,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        mesReferencia: input.mesReferencia,
        summary: input.summary,
        source: "api-server",
      },
    ]);
  } catch {
    /* auditoria não deve quebrar mutação */
  }
}
