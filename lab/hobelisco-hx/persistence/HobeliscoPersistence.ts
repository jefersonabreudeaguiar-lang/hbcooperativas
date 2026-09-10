/** Interface de persistência V2 — swap sem modificar Core V1 */

import type { AuditChainEvent, ThreatFingerprint } from "../types";
import type { HobeliscoIncidentV2, HobeliscoObservationEvent } from "../observation/types";

export interface MemoryEventRecord {
  id: string;
  layer: "short" | "mid" | "long";
  kind: string;
  summary: string;
  cooperativeId: string | null;
  context: Record<string, string | number | boolean>;
  at: string;
  schemaVersion: string;
  environment: string;
}

export interface LearningInsightRecord {
  id: string;
  hypothesis: string;
  state: "PROPOSED" | "VALIDATED" | "REJECTED";
  cooperativeId: string | null;
  at: string;
  schemaVersion: string;
  environment: string;
}

export interface AntibodyCandidateRecord {
  id: string;
  threatPattern: string;
  state: "CANDIDATE" | "VALIDATED" | "REJECTED" | "RETIRED";
  ruleId: string | null;
  at: string;
  schemaVersion: string;
  environment: string;
}

export interface HeartbeatRecord {
  id: string;
  status: "HEALTHY" | "DEGRADED" | "SAFE_MODE";
  payload: Record<string, unknown>;
  at: string;
  schemaVersion: string;
  environment: string;
}

export interface StateTransitionRecord {
  id: string;
  from: string;
  to: string;
  at: string;
  environment: string;
}

export interface PersistenceResult {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

export interface HobeliscoPersistence {
  readonly mode: "memory" | "supabase_staging";
  readonly configured: boolean;
  readonly connectionStatus: "OK" | "NOT_CONFIGURED" | "ERROR";

  saveObservation(event: HobeliscoObservationEvent): Promise<PersistenceResult>;
  getObservation(id: string): Promise<HobeliscoObservationEvent | null>;
  listObservations(filter?: { cooperativeId?: string }): Promise<HobeliscoObservationEvent[]>;

  saveIncident(incident: HobeliscoIncidentV2): Promise<PersistenceResult>;
  getIncident(id: string): Promise<HobeliscoIncidentV2 | null>;
  listIncidents(filter?: { status?: string; limit?: number }): Promise<HobeliscoIncidentV2[]>;

  saveMemoryEvent(event: MemoryEventRecord): Promise<PersistenceResult>;
  listMemoryEvents(cooperativeId?: string): Promise<MemoryEventRecord[]>;

  saveThreatFingerprint(fp: ThreatFingerprint): Promise<PersistenceResult>;
  listThreatFingerprints(): Promise<ThreatFingerprint[]>;

  saveAntibody(record: AntibodyCandidateRecord): Promise<PersistenceResult>;
  saveLearningInsight(insight: LearningInsightRecord): Promise<PersistenceResult>;
  saveHeartbeat(record: HeartbeatRecord): Promise<PersistenceResult>;
  saveStateTransition(record: StateTransitionRecord): Promise<PersistenceResult>;
  saveAuditEvent(event: AuditChainEvent): Promise<PersistenceResult>;
  listAuditEvents(): Promise<AuditChainEvent[]>;

  stats(): Record<string, number>;
}

export function createPersistenceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
