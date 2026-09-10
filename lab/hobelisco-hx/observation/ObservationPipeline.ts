/** Pipeline de observação V2 — PERCEBER → PERSISTIR (sem ALTERAR) */

import { AuditChain } from "../audit/AuditChain";
import { resolveHobeliscoEnvironment, type HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { assertCooperativeScope } from "../security/cooperativeIsolation";
import type { HobeliscoPersistence } from "../persistence/HobeliscoPersistence";
import { CorrelationEngine } from "./CorrelationEngine";
import { EventLossDetector, computeObservationIntegrityRate } from "./EventLossDetector";
import { normalizeRawObservation } from "./Normalizer";
import { blockAnyMutation } from "./ObserveOnlyGuard";
import { containsPersistedSecret, sanitizeObservation } from "./ObservationSanitizer";
import { DEFAULT_RESOURCE_LIMITS, checkEventSize, checkMetadataKeys, checkQueueCapacity } from "./ResourceLimits";
import { emitIncidentAlertIfNeeded } from "./IncidentAlertService";
import type { HobeliscoObservationEvent, V2Metrics } from "./types";

export interface PipelineResult {
  accepted: boolean;
  dropped?: boolean;
  duplicate?: boolean;
  reason?: string;
  event?: HobeliscoObservationEvent;
}

export class ObservationPipeline {
  readonly audit = new AuditChain();
  readonly correlation = new CorrelationEngine();
  readonly lossDetector = new EventLossDetector();
  private queueSize = 0;
  private metrics: V2Metrics = emptyMetrics();

  constructor(
    private persistence: HobeliscoPersistence,
    private environment: HobeliscoEnvironment = resolveHobeliscoEnvironment()
  ) {}

  ingest(raw: Parameters<typeof normalizeRawObservation>[0]): PipelineResult {
    if (this.environment === "PRODUCTION") {
      this.metrics.productionTripwires += 1;
      this.audit.append("production_tripwire", { action: "ingest_blocked" });
      return { accepted: false, reason: "OBSERVER_DISABLED" };
    }

    const rawSizeCheck = checkEventSize(JSON.stringify(raw));
    if (!rawSizeCheck.allowed) {
      this.metrics.observationsDropped += 1;
      this.audit.append("drop_with_audit", { reason: rawSizeCheck.reason });
      return { accepted: false, dropped: true, reason: rawSizeCheck.reason };
    }

    const queueCheck = checkQueueCapacity(this.queueSize);
    if (!queueCheck.allowed) {
      this.metrics.observationsDropped += 1;
      this.audit.append("drop_with_audit", { reason: queueCheck.reason });
      return { accepted: false, dropped: true, reason: queueCheck.reason };
    }

    let event = normalizeRawObservation({ ...raw, environment: this.environment });

    if (event.cooperativeId) {
      const scope = assertCooperativeScope(event.cooperativeId, event.cooperativeId);
      if (!scope.ok) {
        this.metrics.boundaryBlocks += 1;
        return { accepted: false, reason: "cooperative_scope_invalid" };
      }
    }

    const sizeCheck = checkEventSize(JSON.stringify(event));
    if (!sizeCheck.allowed) {
      this.metrics.observationsDropped += 1;
      this.audit.append("drop_with_audit", { reason: sizeCheck.reason });
      return { accepted: false, dropped: true, reason: sizeCheck.reason };
    }

    const metaCheck = checkMetadataKeys(Object.keys(event.metadata).length);
    if (!metaCheck.allowed) {
      this.metrics.observationsDropped += 1;
      return { accepted: false, dropped: true, reason: metaCheck.reason };
    }

    event = sanitizeObservation(event);
    if (containsPersistedSecret(event)) {
      this.metrics.observationsDropped += 1;
      return { accepted: false, reason: "secret_detected_pre_persist" };
    }

    this.queueSize += 1;
    this.metrics.observationsReceived += 1;
    this.lossDetector.recordReceived(1);
    this.audit.append("observation", { id: event.id, sensor: event.sensor });
    const corr = this.correlation.ingest(event);

    if (corr.incident) {
      this.metrics.incidentsObserved += 1;
      void this.mergeAndSaveIncident(corr.incident).then((saved) =>
        emitIncidentAlertIfNeeded(this.persistence, saved)
      );
      this.audit.append("incident_candidate", {
        id: corr.incident.incidentId,
        fingerprint: corr.fingerprint,
        humanRequired: true,
      });
    }

    return { accepted: true, event };
  }

  async observeFromEvent(event: HobeliscoObservationEvent): Promise<PipelineResult> {
    if (this.environment === "PRODUCTION") {
      this.metrics.productionTripwires += 1;
      return { accepted: false, reason: "OBSERVER_DISABLED" };
    }

    const sanitized = sanitizeObservation(event);
    if (containsPersistedSecret(sanitized)) {
      this.metrics.observationsDropped += 1;
      return { accepted: false, reason: "secret_detected_pre_persist" };
    }

    this.queueSize += 1;
    this.metrics.observationsReceived += 1;
    this.lossDetector.recordReceived(1);
    this.audit.append("observation", { id: sanitized.id, sensor: sanitized.sensor });
    const corr = this.correlation.ingest(sanitized);

    if (corr.incident) {
      this.metrics.incidentsObserved += 1;
      void this.mergeAndSaveIncident(corr.incident).then((saved) =>
        emitIncidentAlertIfNeeded(this.persistence, saved)
      );
    }

    return this.persist(sanitized);
  }

  async persist(event: HobeliscoObservationEvent): Promise<PipelineResult> {
    const result = await this.persistence.saveObservation(event);
    if (result.duplicate) {
      this.metrics.duplicateObservations += 1;
      return { accepted: true, duplicate: true, event };
    }
    if (!result.ok) {
      this.metrics.persistenceFailures += 1;
      this.lossDetector.detectLoss("persistence", 1, 0, result.error ?? "persist_failed");
      this.audit.append("persistence_failure", { id: event.id, error: result.error });
      return { accepted: false, reason: result.error };
    }
    this.metrics.observationsPersisted += 1;
    this.lossDetector.recordPersisted(1);
    this.queueSize = Math.max(0, this.queueSize - 1);
    await this.persistence.saveAuditEvent(this.audit.append("observation_persisted", { id: event.id }));
    return { accepted: true, event };
  }

  async observe(raw: Parameters<typeof normalizeRawObservation>[0]): Promise<PipelineResult> {
    const ingested = this.ingest(raw);
    if (!ingested.accepted || !ingested.event) return ingested;
    return this.persist(ingested.event);
  }

  private async mergeAndSaveIncident(incident: import("./types").HobeliscoIncidentV2): Promise<import("./types").HobeliscoIncidentV2> {
    const existing = await this.persistence.getIncident(incident.incidentId);
    let merged = incident;
    if (
      existing &&
      existing.status !== "DISMISSED" &&
      existing.status !== "CONFIRMED"
    ) {
      merged = {
        ...incident,
        firstSeen: existing.firstSeen,
        signalsCount: existing.signalsCount + 1,
        lastSeen: incident.lastSeen,
        context: {
          ...existing.context,
          ...incident.context,
          occurrences: existing.signalsCount + 1,
        },
        updatedAt: new Date().toISOString(),
      };
    }
    await this.persistence.saveIncident(merged);
    this.audit.append(existing ? "incident_updated" : "incident_created", {
      id: merged.incidentId,
      signalsCount: merged.signalsCount,
    });
    return merged;
  }

  attemptMutation(action: string): ReturnType<typeof blockAnyMutation> {
    const block = blockAnyMutation(action);
    if (block.blocked) {
      this.metrics.boundaryBlocks += 1;
      if (block.auditKind === "FINANCIAL_BOUNDARY_BLOCKED") this.metrics.financialBlocks += 1;
      this.audit.append("boundary_block", { action, category: block.category });
    }
    return block;
  }

  getMetrics(): V2Metrics {
    this.metrics.observationIntegrityRate = computeObservationIntegrityRate(
      this.metrics.observationsReceived,
      this.metrics.observationsPersisted
    );
    return { ...this.metrics };
  }

  verifyAudit(minCount = 1000): { ok: boolean; count: number } {
    while (this.audit.length < minCount) {
      this.audit.append("audit_fill", { n: this.audit.length });
    }
    const v = this.audit.verify();
    if (!v.ok) this.metrics.auditIntegrityFailures += 1;
    return { ok: v.ok, count: this.audit.length };
  }

  resetMetrics(): void {
    this.metrics = emptyMetrics();
  }
}

function emptyMetrics(): V2Metrics {
  return {
    observationsReceived: 0,
    observationsPersisted: 0,
    observationsDropped: 0,
    persistenceFailures: 0,
    duplicateObservations: 0,
    incidentsObserved: 0,
    incidentsConfirmed: 0,
    falsePositives: 0,
    unknownPatterns: 0,
    candidateAntibodies: 0,
    boundaryBlocks: 0,
    productionTripwires: 0,
    financialBlocks: 0,
    sensorFailures: 0,
    memoryRecallFailures: 0,
    auditIntegrityFailures: 0,
    observationIntegrityRate: 0,
  };
}

export { DEFAULT_RESOURCE_LIMITS };
