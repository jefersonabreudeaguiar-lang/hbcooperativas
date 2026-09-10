/** Leis imutáveis — o organismo pode evoluir; estas não */

export const HOBELISCO_INVARIANTS = [
  "INVARIANT_COOPERATIVE_ISOLATION",
  "INVARIANT_LEDGER_IMMUTABILITY",
  "INVARIANT_NO_CROSS_COOPERATIVE_ACCESS",
  "INVARIANT_IDEMPOTENCY",
  "INVARIANT_NO_NEGATIVE_CREDIT",
  "INVARIANT_REFUND_SINGLE_EXECUTION",
  "INVARIANT_AUTHORIZATION_SERVER_SIDE",
  "INVARIANT_AUDIT_APPEND_ONLY",
  "INVARIANT_MIGRATION_VERSIONED",
] as const;

export type HobeliscoInvariant = (typeof HOBELISCO_INVARIANTS)[number];

export function assertInvariant(name: HobeliscoInvariant): { ok: true; name: HobeliscoInvariant } {
  if (!HOBELISCO_INVARIANTS.includes(name)) {
    throw new Error(`Invariante desconhecida: ${name}`);
  }
  return { ok: true, name };
}

export function verifyAllInvariants(): { ok: boolean; missing: string[] } {
  const required = 9;
  const missing: string[] = [];
  if (HOBELISCO_INVARIANTS.length < required) {
    missing.push(`expected ${required} invariants`);
  }
  return { ok: missing.length === 0, missing };
}
