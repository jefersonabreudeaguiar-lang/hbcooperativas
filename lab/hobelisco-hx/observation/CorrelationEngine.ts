/** Correlation Engine — agrupa sinais sem afirmar ATTACK CONFIRMED automaticamente */

import { createHash } from "crypto";
import type { HobeliscoIncidentV2, HobeliscoObservationEvent, CorrelationLevel } from "./types";

export interface CorrelationResult {
  level: CorrelationLevel;
  fingerprint: string;
  signalsCount: number;
  explanation: string;
  confidence: number;
  incident?: HobeliscoIncidentV2;
}

function groupKey(event: HobeliscoObservationEvent): string {
  return [
    event.cooperativeId ?? "global",
    event.sensor,
    event.eventType,
    event.endpoint ?? "",
    event.operation ?? "",
  ].join("|");
}

function resolveBucketFingerprint(list: HobeliscoObservationEvent[], event: HobeliscoObservationEvent): string {
  const stable =
    (typeof event.metadata.stableFingerprint === "string" && event.metadata.stableFingerprint) ||
    list.map((e) => e.metadata.stableFingerprint).find((v) => typeof v === "string" && v.length > 0);
  if (typeof stable === "string" && stable.length > 0) {
    return createHash("sha256").update(stable).digest("hex").slice(0, 16);
  }
  return createHash("sha256")
    .update(list.map((e) => e.id).join(":"))
    .digest("hex")
    .slice(0, 16);
}

const CRITICAL_CREDIT_EVENTS = new Set([
  "credit_integrity_over_limit",
  "credit_integrity_invalid_limit",
  "credit_integrity_invalid_used",
  "credit_integrity_invalid_available",
  "credit_probe_execution_error",
]);

export class CorrelationEngine {
  private buckets = new Map<string, HobeliscoObservationEvent[]>();

  ingest(event: HobeliscoObservationEvent): CorrelationResult {
    const key = groupKey(event);
    const list = this.buckets.get(key) ?? [];
    list.push(event);
    this.buckets.set(key, list);

    const fingerprint = resolveBucketFingerprint(list, event);

    let level: CorrelationLevel = "SIGNAL";
    if (list.length >= 3) level = "PATTERN";
    if (list.length >= 5) level = "INCIDENT_CANDIDATE";

    const sameWindow = list.filter(
      (e) => Math.abs(new Date(e.timestamp).getTime() - new Date(event.timestamp).getTime()) < 300_000
    );
    const authFailures = list.filter((e) => e.eventType.includes("auth_failure")).length;
    const isCriticalCredit = CRITICAL_CREDIT_EVENTS.has(event.eventType);

    let confidence = Math.min(0.95, list.length * 0.12);
    if (authFailures >= 5 && sameWindow.length >= 5) {
      level = "INCIDENT_CANDIDATE";
      confidence = Math.min(0.85, 0.4 + authFailures * 0.08);
    }
    if (isCriticalCredit && list.length >= 1) {
      level = "INCIDENT_CANDIDATE";
      confidence = Math.min(0.88, 0.55 + list.length * 0.06);
    }
    if (event.eventType === "credit_integrity_divergence" && list.length >= 2) {
      level = "INCIDENT_CANDIDATE";
      confidence = Math.min(0.82, 0.45 + list.length * 0.1);
    }

    const explanation =
      level === "SIGNAL"
        ? `Sinal isolado: ${event.eventType}`
        : level === "PATTERN"
          ? `${list.length} sinais correlacionados em ${event.sensor}`
          : `Candidato a incidente: ${list.length} sinais, janela ${sameWindow.length}`;

    const incident: HobeliscoIncidentV2 | undefined =
      level === "INCIDENT_CANDIDATE"
        ? {
            incidentId: `inc_v2_${fingerprint}`,
            firstSeen: list[0].timestamp,
            lastSeen: event.timestamp,
            environment: event.environment,
            cooperativeId: event.cooperativeId,
            severity: event.severity,
            status: "CORRELATED",
            confidence,
            signalsCount: list.length,
            fingerprint: `THREAT-FP-${fingerprint.toUpperCase()}`,
            context: {
              sensor: event.sensor,
              eventType: event.eventType,
              accountId: String(event.metadata.accountId ?? ""),
              cooperadoId: String(event.metadata.cooperadoId ?? ""),
              expectedCents: Number(event.metadata.expectedCents ?? 0),
              observedCents: Number(event.metadata.observedCents ?? 0),
              differenceCents: Number(event.metadata.differenceCents ?? 0),
              occurrences: Number(event.metadata.occurrences ?? list.length),
            },
            explanation,
            relatedMemoryIds: [],
            relatedAntibodyIds: [],
            correlationLevel: level,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : undefined;

    return {
      level,
      fingerprint: `THREAT-FP-${fingerprint.toUpperCase()}`,
      signalsCount: list.length,
      explanation,
      confidence,
      incident,
    };
  }

  confirmIncident(candidate: HobeliscoIncidentV2, criteria: {
    minSignals: number;
    minConfidence: number;
    humanAck?: boolean;
  }): HobeliscoIncidentV2 | null {
    if (candidate.signalsCount < criteria.minSignals) return null;
    if (candidate.confidence < criteria.minConfidence) return null;
    if (!criteria.humanAck) return null;
    return {
      ...candidate,
      status: "CONFIRMED",
      correlationLevel: "CONFIRMED_INCIDENT",
      updatedAt: new Date().toISOString(),
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
