import type { SessionClaims } from "@/lib/security/jwt";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Cooperado autorizado (Jeferson — CoopeagriPla). Identificador canônico no código/testes. */
export const BIC_D1_AUTHORIZED_COOPERADO_ID = "c_1781981564381_w67gg";

/** Tenant autorizado — CNPJ CoopeagriPla (artefatos locais / testes). */
export const BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ = "62351750000165";

const ENABLED_RAW = "1";

export function isBicD1DiagnosticEnabled(): boolean {
  const raw = process.env.BIC_D1_DIAGNOSTIC_ENABLED?.trim();
  return raw === ENABLED_RAW;
}

export type BicD1DiagnosticDenyReason =
  | "disabled"
  | "no_session"
  | "cooperado_mismatch"
  | "cnpj_mismatch";

export type BicD1DiagnosticAccessResult =
  | { allowed: true }
  | { allowed: false; reason: BicD1DiagnosticDenyReason };

/**
 * Autorização BIC-D1 — somente claims da sessão/JWT (fail-closed).
 * Não aceita cooperadoId/CNPJ do cliente, AppData ou query.
 */
export function evaluateBicD1DiagnosticAccess(
  session: SessionClaims | null | undefined,
  options?: { enabled?: boolean }
): BicD1DiagnosticAccessResult {
  const enabled = options?.enabled ?? isBicD1DiagnosticEnabled();
  if (!enabled) {
    return { allowed: false, reason: "disabled" };
  }

  if (!session?.sub) {
    return { allowed: false, reason: "no_session" };
  }

  const cooperadoId = session.cooperadoId?.trim();
  if (!cooperadoId || cooperadoId !== BIC_D1_AUTHORIZED_COOPERADO_ID) {
    return { allowed: false, reason: "cooperado_mismatch" };
  }

  const sessionCnpj = session.cooperativaCnpj ? normalizeCnpj(session.cooperativaCnpj) : "";
  const expectedCnpj = normalizeCnpj(BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ);
  if (sessionCnpj.length !== 14 || sessionCnpj !== expectedCnpj) {
    return { allowed: false, reason: "cnpj_mismatch" };
  }

  return { allowed: true };
}

/** Resposta HTTP mínima para GET /api/diagnostic/bic-d1/eligibility. */
export function resolveBicD1EligibilityHttp(
  session: SessionClaims | null,
  enforced: boolean
): { status: 200 | 401 | 403; body: { allowed: boolean } } {
  if (!enforced || !session?.sub) {
    return { status: 401, body: { allowed: false } };
  }

  const access = evaluateBicD1DiagnosticAccess(session);
  if (!access.allowed) {
    return { status: 403, body: { allowed: false } };
  }

  return { status: 200, body: { allowed: true } };
}
