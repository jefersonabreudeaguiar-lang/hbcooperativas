import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionClaims } from "@/lib/security/jwt";
import { logSecurityEvent } from "@/lib/supabase/usersAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlatformSecurityAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.cross_tenant_blocked"
  | "admin.access"
  | "credit.reconciliation_alert";

export async function recordPlatformSecurityEvent(input: {
  action: PlatformSecurityAction;
  userId?: string;
  userEmail?: string;
  cooperativaCnpj?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    await logSecurityEvent(supabase, input);
  } catch {
    /* auditoria não deve quebrar fluxo */
  }
}

export function recordCrossTenantBlocked(input: {
  session: SessionClaims;
  requestedCnpj: string;
  ip?: string;
  endpoint?: string;
}): void {
  void recordPlatformSecurityEvent({
    action: "auth.cross_tenant_blocked",
    userId: input.session.sub,
    userEmail: input.session.email,
    cooperativaCnpj: input.session.cooperativaCnpj,
    ip: input.ip,
    metadata: {
      requestedCnpj: input.requestedCnpj.replace(/\D/g, ""),
      sessionCnpj: input.session.cooperativaCnpj?.replace(/\D/g, "") ?? null,
      role: input.session.role,
      endpoint: input.endpoint ?? null,
    },
  });
}

export async function recordCreditReconciliationAlerts(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  findings: Array<{ eventType: string; accountId: string; differenceCents: number | null }>
): Promise<void> {
  if (findings.length === 0) return;
  await logSecurityEvent(supabase, {
    action: "credit.reconciliation_alert",
    cooperativaCnpj: cooperativeCnpj,
    metadata: {
      count: findings.length,
      findings: findings.slice(0, 20),
    },
  });
}
