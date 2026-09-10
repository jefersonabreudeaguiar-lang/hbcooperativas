export type CreditWatchSeverity = "INFO" | "WARNING" | "CRITICAL";

export type CreditWatchEventType =
  | "credit_integrity_ok"
  | "credit_integrity_divergence"
  | "credit_integrity_over_limit"
  | "credit_integrity_invalid_limit"
  | "credit_integrity_invalid_used"
  | "credit_integrity_invalid_available"
  | "credit_probe_execution_error";

export interface CreditAccountRow {
  accountId: string;
  cooperadoId: string;
  limitCents: number;
  usedCents: number;
  availableCents: number;
}

export interface CreditObservation {
  coopCnpj: string;
  accountId: string;
  cooperadoId: string;
  limitCents: number;
  usedCents: number;
  availableCents: number;
  expectedAvailableCents: number;
  differenceCents: number;
  observedAt: string;
}

export interface CreditIntegrityFinding {
  id: string;
  snapshotId: string;
  coopCnpj: string;
  accountId: string;
  cooperadoId: string;
  eventType: CreditWatchEventType;
  severity: CreditWatchSeverity;
  expectedCents: number | null;
  observedCents: number | null;
  differenceCents: number | null;
  fingerprint: string;
  stableFingerprint: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreditProbeSnapshot {
  id: string;
  coopCnpj: string;
  probeType: string;
  observedAt: string;
  status: "OK" | "FINDINGS" | "ERROR" | "CHANGED_OK";
  payloadHash: string;
  accountsRead: number;
  runId: string;
  createdAt: string;
}

export type IncidentOutcomeType =
  | "RESOLVED"
  | "FALSE_ALARM"
  | "ESCALATED"
  | "STILL_INVESTIGATING";

export interface IncidentOutcomeRecord {
  id: string;
  incidentId: string;
  outcome: IncidentOutcomeType;
  notes: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface CreditWatchRunResult {
  runId: string;
  coopCnpj: string;
  accountsRead: number;
  findingsCreated: number;
  findingsUpdated: number;
  findingsResolved: number;
  observationsEmitted: number;
  durationMs: number;
  error?: string;
}
