/** InMemoryPersistence — V2 lab + testes de restart */

import type { AuditChainEvent, ThreatFingerprint } from "../types";
import type { HobeliscoIncidentV2, HobeliscoObservationEvent } from "../observation/types";
import type {
  AntibodyCandidateRecord,
  HeartbeatRecord,
  HobeliscoPersistence,
  LearningInsightRecord,
  MemoryEventRecord,
  PersistenceResult,
  StateTransitionRecord,
} from "./HobeliscoPersistence";

export class InMemoryPersistence implements HobeliscoPersistence {
  readonly mode = "memory" as const;
  readonly configured = true;
  readonly connectionStatus = "OK" as const;

  private observations = new Map<string, HobeliscoObservationEvent>();
  private incidents = new Map<string, HobeliscoIncidentV2>();
  private memoryEvents: MemoryEventRecord[] = [];
  private threats: ThreatFingerprint[] = [];
  private antibodies: AntibodyCandidateRecord[] = [];
  private insights: LearningInsightRecord[] = [];
  private heartbeats: HeartbeatRecord[] = [];
  private transitions: StateTransitionRecord[] = [];
  private auditEvents: AuditChainEvent[] = [];
  private observationIdsSeen = new Set<string>();

  async saveObservation(event: HobeliscoObservationEvent): Promise<PersistenceResult> {
    if (this.observationIdsSeen.has(event.id)) {
      return { ok: true, duplicate: true };
    }
    this.observationIdsSeen.add(event.id);
    const persisted = { ...event, persistedAt: new Date().toISOString() };
    this.observations.set(event.id, persisted);
    return { ok: true };
  }

  async getObservation(id: string): Promise<HobeliscoObservationEvent | null> {
    return this.observations.get(id) ?? null;
  }

  async listObservations(filter?: { cooperativeId?: string }): Promise<HobeliscoObservationEvent[]> {
    const all = [...this.observations.values()];
    if (!filter?.cooperativeId) return all;
    return all.filter((o) => o.cooperativeId === filter.cooperativeId);
  }

  async saveIncident(incident: HobeliscoIncidentV2): Promise<PersistenceResult> {
    this.incidents.set(incident.incidentId, incident);
    return { ok: true };
  }

  async getIncident(id: string): Promise<HobeliscoIncidentV2 | null> {
    return this.incidents.get(id) ?? null;
  }

  async listIncidents(filter?: { status?: string; limit?: number }): Promise<HobeliscoIncidentV2[]> {
    let all = [...this.incidents.values()];
    if (filter?.status) all = all.filter((i) => i.status === filter.status);
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return all.slice(0, filter?.limit ?? 50);
  }

  async saveMemoryEvent(event: MemoryEventRecord): Promise<PersistenceResult> {
    this.memoryEvents.push(event);
    return { ok: true };
  }

  async listMemoryEvents(cooperativeId?: string): Promise<MemoryEventRecord[]> {
    if (!cooperativeId) return [...this.memoryEvents];
    return this.memoryEvents.filter((m) => m.cooperativeId === cooperativeId);
  }

  async saveThreatFingerprint(fp: ThreatFingerprint): Promise<PersistenceResult> {
    this.threats.unshift(fp);
    return { ok: true };
  }

  async listThreatFingerprints(): Promise<ThreatFingerprint[]> {
    return [...this.threats];
  }

  async saveAntibody(record: AntibodyCandidateRecord): Promise<PersistenceResult> {
    this.antibodies.push(record);
    return { ok: true };
  }

  async saveLearningInsight(insight: LearningInsightRecord): Promise<PersistenceResult> {
    this.insights.push(insight);
    return { ok: true };
  }

  async saveHeartbeat(record: HeartbeatRecord): Promise<PersistenceResult> {
    this.heartbeats.push(record);
    return { ok: true };
  }

  async saveStateTransition(record: StateTransitionRecord): Promise<PersistenceResult> {
    this.transitions.push(record);
    return { ok: true };
  }

  async saveAuditEvent(event: AuditChainEvent): Promise<PersistenceResult> {
    this.auditEvents.push(event);
    return { ok: true };
  }

  async listAuditEvents(): Promise<AuditChainEvent[]> {
    return [...this.auditEvents];
  }

  stats(): Record<string, number> {
    return {
      observations: this.observations.size,
      incidents: this.incidents.size,
      memoryEvents: this.memoryEvents.length,
      threats: this.threats.length,
      antibodies: this.antibodies.length,
      insights: this.insights.length,
      heartbeats: this.heartbeats.length,
      auditEvents: this.auditEvents.length,
      duplicatesDetected: this.observationIdsSeen.size - this.observations.size,
    };
  }

  /** Export for restart simulation */
  exportSnapshot(): InMemoryPersistence {
    const copy = new InMemoryPersistence();
    for (const [k, v] of this.observations) copy.observations.set(k, { ...v });
    for (const [k, v] of this.incidents) copy.incidents.set(k, { ...v });
    copy.memoryEvents = [...this.memoryEvents];
    copy.threats = [...this.threats];
    copy.antibodies = [...this.antibodies];
    copy.insights = [...this.insights];
    copy.heartbeats = [...this.heartbeats];
    copy.transitions = [...this.transitions];
    copy.auditEvents = [...this.auditEvents];
    copy.observationIdsSeen = new Set(this.observationIdsSeen);
    return copy;
  }

  static fromSnapshot(snapshot: InMemoryPersistence): InMemoryPersistence {
    return snapshot.exportSnapshot();
  }
}

let shared: InMemoryPersistence | null = null;

export function getInMemoryPersistence(reset = false): InMemoryPersistence {
  if (reset || !shared) shared = new InMemoryPersistence();
  return shared;
}

export function resetInMemoryPersistence(): InMemoryPersistence {
  shared = new InMemoryPersistence();
  return shared;
}
