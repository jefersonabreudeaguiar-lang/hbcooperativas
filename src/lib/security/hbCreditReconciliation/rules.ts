import type { CreditAccountRow, CreditFinding, CreditObservation } from "@/lib/security/hbCreditReconciliation/types";

export function buildCreditObservation(
  cooperativeCnpj: string,
  row: CreditAccountRow,
  observedAt: string
): CreditObservation {
  return {
    cooperativeCnpj,
    accountId: row.accountId,
    snapshotId: observedAt,
    observedAt,
    limitCents: row.limitCents,
    usedCents: row.usedCents,
    availableCents: row.availableCents,
  };
}

const AVAILABLE_TOLERANCE_CENTS = 1;

export function evaluateCreditObservation(obs: CreditObservation, _snapshotId: string): CreditFinding[] {
  const findings: CreditFinding[] = [];
  const limit = Math.round(Number(obs.limitCents));
  const used = Math.round(Number(obs.usedCents));
  const available = Math.round(Number(obs.availableCents));

  if (![limit, used, available].every(Number.isFinite)) {
    findings.push({
      accountId: obs.accountId,
      eventType: "credit_integrity_invalid_values",
      expectedCents: null,
      observedCents: null,
      differenceCents: null,
    });
    return findings;
  }

  if (used > limit) {
    findings.push({
      accountId: obs.accountId,
      eventType: "credit_integrity_used_above_limit",
      expectedCents: limit,
      observedCents: used,
      differenceCents: used - limit,
    });
  }

  const expectedAvailable = limit - used;
  if (Math.abs(available - expectedAvailable) > AVAILABLE_TOLERANCE_CENTS) {
    findings.push({
      accountId: obs.accountId,
      eventType: "credit_integrity_available_mismatch",
      expectedCents: expectedAvailable,
      observedCents: available,
      differenceCents: available - expectedAvailable,
    });
  }

  return findings;
}

export function filterActionableFindings(findings: CreditFinding[]): CreditFinding[] {
  return findings;
}
