/** Ações de auditoria — nunca incluir PIN, senha, token ou nonce completo. */
export type HbCreditAuditAction =
  | "LIMIT_CHANGED"
  | "PARTNER_CREATED"
  | "PARTNER_APPROVED"
  | "PARTNER_BLOCKED"
  | "PAYMENT_INTENT_CREATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_DECLINED"
  | "REFUND_CREATED";

export const SENSITIVE_AUDIT_KEYS = [
  "password",
  "pin",
  "token",
  "nonce",
  "authorization",
  "secret",
] as const;

export function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_AUDIT_KEYS.some((s) => key.toLowerCase().includes(s))) continue;
    out[key] = value;
  }
  return out;
}
