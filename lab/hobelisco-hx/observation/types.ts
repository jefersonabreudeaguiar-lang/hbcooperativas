/** Contrato de observação V2 — OBSERVE ONLY */

import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import type { SensorKind } from "../types";

export const OBSERVATION_SCHEMA_VERSION = "2.0";

export type ObservationSeverity = "info" | "low" | "medium" | "high" | "critical";

export type ObservationActorType = "user" | "system" | "device" | "anonymous" | "unknown";

export interface HobeliscoObservationEvent {
  id: string;
  timestamp: string;
  observedAt: string;
  persistedAt?: string;
  environment: HobeliscoEnvironment;
  source: string;
  sensor: SensorKind;
  eventType: string;
  severity: ObservationSeverity;
  cooperativeId: string | null;
  actorType: ObservationActorType;
  actorIdHash: string | null;
  requestId: string | null;
  correlationId: string | null;
  endpoint: string | null;
  operation: string | null;
  outcome: "success" | "failure" | "unknown" | "blocked";
  metadata: Record<string, string | number | boolean>;
  fingerprint: string;
  schemaVersion: string;
}

export type CorrelationLevel = "SIGNAL" | "PATTERN" | "INCIDENT_CANDIDATE" | "CONFIRMED_INCIDENT";

export type IncidentStatus =
  | "OBSERVED"
  | "CORRELATED"
  | "INVESTIGATING"
  | "CONFIRMED"
  | "DISMISSED";

export type AntibodyV2State = "CANDIDATE" | "VALIDATED" | "REJECTED" | "RETIRED";

export type LearningInsightState = "PROPOSED" | "VALIDATED" | "REJECTED";

export type FalsePositiveLabel = "TRUE_POSITIVE" | "FALSE_POSITIVE" | "UNKNOWN";

export interface HobeliscoIncidentV2 {
  incidentId: string;
  firstSeen: string;
  lastSeen: string;
  environment: HobeliscoEnvironment;
  cooperativeId: string | null;
  severity: ObservationSeverity;
  status: IncidentStatus;
  confidence: number;
  signalsCount: number;
  fingerprint: string;
  context: Record<string, string | number | boolean>;
  explanation: string;
  relatedMemoryIds: string[];
  relatedAntibodyIds: string[];
  correlationLevel: CorrelationLevel;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationLossRecord {
  lossDetected: true;
  estimatedCount: number;
  source: string;
  reason: string;
  timestamp: string;
}

export interface V2Metrics {
  observationsReceived: number;
  observationsPersisted: number;
  observationsDropped: number;
  persistenceFailures: number;
  duplicateObservations: number;
  incidentsObserved: number;
  incidentsConfirmed: number;
  falsePositives: number;
  unknownPatterns: number;
  candidateAntibodies: number;
  boundaryBlocks: number;
  productionTripwires: number;
  financialBlocks: number;
  sensorFailures: number;
  memoryRecallFailures: number;
  auditIntegrityFailures: number;
  observationIntegrityRate: number;
}

export interface ObserveOnlyBlockResult {
  blocked: true;
  category: string;
  reason: string;
  auditKind: "BOUNDARY_BLOCK" | "FINANCIAL_BOUNDARY_BLOCKED" | "HOBELISCO_V2_BOUNDARY_VIOLATION";
}
