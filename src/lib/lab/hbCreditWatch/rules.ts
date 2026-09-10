import type {
  CreditAccountRow,
  CreditIntegrityFinding,
  CreditObservation,
  CreditWatchEventType,
  CreditWatchSeverity,
} from "./types";
import { buildFindingFingerprint, buildStableFingerprint } from "./fingerprint";

export function buildCreditObservation(
  coopCnpj: string,
  row: CreditAccountRow,
  observedAt: string
): CreditObservation {
  const expectedAvailableCents = row.limitCents - row.usedCents;
  return {
    coopCnpj,
    accountId: row.accountId,
    cooperadoId: row.cooperadoId,
    limitCents: row.limitCents,
    usedCents: row.usedCents,
    availableCents: row.availableCents,
    expectedAvailableCents,
    differenceCents: row.availableCents - expectedAvailableCents,
    observedAt,
  };
}

export function severityForEventType(eventType: CreditWatchEventType): CreditWatchSeverity {
  switch (eventType) {
    case "credit_integrity_ok":
      return "INFO";
    case "credit_integrity_divergence":
      return "WARNING";
    case "credit_integrity_over_limit":
    case "credit_integrity_invalid_limit":
    case "credit_integrity_invalid_used":
    case "credit_integrity_invalid_available":
    case "credit_probe_execution_error":
      return "CRITICAL";
    default:
      return "WARNING";
  }
}

export function evaluateCreditObservation(
  obs: CreditObservation,
  snapshotId: string
): CreditIntegrityFinding[] {
  const findings: CreditIntegrityFinding[] = [];
  const now = obs.observedAt;

  const pushFinding = (
    eventType: CreditWatchEventType,
    expectedCents: number | null,
    observedCents: number | null,
    differenceCents: number | null
  ) => {
    const stableFingerprint = buildStableFingerprint({
      coopCnpj: obs.coopCnpj,
      accountId: obs.accountId,
      eventType,
      expectedCents,
      observedCents,
    });
    findings.push({
      id: buildFindingFingerprint(stableFingerprint),
      snapshotId,
      coopCnpj: obs.coopCnpj,
      accountId: obs.accountId,
      cooperadoId: obs.cooperadoId,
      eventType,
      severity: severityForEventType(eventType),
      expectedCents,
      observedCents,
      differenceCents,
      fingerprint: buildFindingFingerprint(stableFingerprint),
      stableFingerprint,
      createdAt: now,
      resolvedAt: null,
    });
  };

  if (obs.limitCents < 0) {
    pushFinding("credit_integrity_invalid_limit", 0, obs.limitCents, obs.limitCents);
  }
  if (obs.usedCents < 0) {
    pushFinding("credit_integrity_invalid_used", 0, obs.usedCents, obs.usedCents);
  }
  if (obs.availableCents < 0) {
    pushFinding("credit_integrity_invalid_available", 0, obs.availableCents, obs.availableCents);
  }
  if (obs.usedCents > obs.limitCents) {
    pushFinding("credit_integrity_over_limit", obs.limitCents, obs.usedCents, obs.usedCents - obs.limitCents);
  }
  if (obs.availableCents !== obs.expectedAvailableCents) {
    pushFinding(
      "credit_integrity_divergence",
      obs.expectedAvailableCents,
      obs.availableCents,
      obs.differenceCents
    );
  }

  if (findings.length === 0) {
    pushFinding("credit_integrity_ok", obs.expectedAvailableCents, obs.availableCents, 0);
  }

  return findings;
}

export function filterActionableFindings(findings: CreditIntegrityFinding[]): CreditIntegrityFinding[] {
  return findings.filter((f) => f.eventType !== "credit_integrity_ok");
}

export function mapSeverityToObservation(severity: CreditWatchSeverity): "info" | "low" | "medium" | "high" | "critical" {
  switch (severity) {
    case "INFO":
      return "info";
    case "WARNING":
      return "medium";
    case "CRITICAL":
      return "critical";
    default:
      return "medium";
  }
}
