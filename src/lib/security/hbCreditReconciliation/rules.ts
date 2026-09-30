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

export function evaluateCreditObservation(_obs: CreditObservation, _snapshotId: string): CreditFinding[] {
  return [];
}

export function filterActionableFindings(findings: CreditFinding[]): CreditFinding[] {
  return findings;
}
