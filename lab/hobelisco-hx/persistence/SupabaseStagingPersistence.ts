/** Supabase Staging Persistence — observe-only, staging creds only */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
import { InMemoryPersistence } from "./InMemoryPersistence";

export const STAGING_CONNECTION_NOT_CONFIGURED = "STAGING_CONNECTION_NOT_CONFIGURED";

export interface StagingConnectionConfig {
  url?: string;
  serviceRoleKey?: string;
  schema?: string;
}

function createStagingSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WebSocketImpl = require("ws") as typeof WebSocket;
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocketImpl },
    });
  } catch {
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}

function isInvalidStagingValue(value?: string): boolean {
  if (!value?.trim()) return true;
  const v = value.trim().toLowerCase();
  return v.includes("<copie") || v.includes("copie de") || v.startsWith("your_");
}

function readStagingConfig(env: NodeJS.ProcessEnv = process.env): StagingConnectionConfig {
  let url =
    env.HB_HOBELISCO_LAB_SUPABASE_URL ?? env.HB_HOBELISCO_STAGING_SUPABASE_URL;
  let serviceRoleKey =
    env.HB_HOBELISCO_LAB_SERVICE_ROLE_KEY ?? env.HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY;

  const boundaryStrict = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_BOUNDARY_STRICT ?? "").trim().toLowerCase()
  );
  const mirrorMode = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_MIRROR_ENABLED ?? "").trim().toLowerCase()
  );
  const labDeploy = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_LAB_DEPLOY ?? "").trim().toLowerCase()
  );
  const forbidProdFallback = boundaryStrict || mirrorMode || labDeploy;

  if (!forbidProdFallback) {
    if (isInvalidStagingValue(url) && env.NEXT_PUBLIC_SUPABASE_URL) {
      url = env.NEXT_PUBLIC_SUPABASE_URL;
    }
    if (isInvalidStagingValue(serviceRoleKey) && env.SUPABASE_SERVICE_ROLE_KEY) {
      serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    }
  }

  return {
    url,
    serviceRoleKey,
    schema: env.HB_HOBELISCO_STAGING_SCHEMA ?? "public",
  };
}

export function getStagingSupabaseClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
  if (!isStagingPersistenceConfigured(env)) return null;
  const cfg = readStagingConfig(env);
  if (!cfg.url || !cfg.serviceRoleKey) return null;
  try {
    return createStagingSupabaseClient(cfg.url, cfg.serviceRoleKey);
  } catch {
    return null;
  }
}

export function isStagingPersistenceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = readStagingConfig(env);
  const stagingEnabled = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_STAGING_ENABLED ?? "").trim().toLowerCase()
  );
  const mirrorEnabled = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_MIRROR_ENABLED ?? "").trim().toLowerCase()
  );
  const labDeploy = ["true", "1", "yes"].includes(
    (env.HB_HOBELISCO_LAB_DEPLOY ?? "").trim().toLowerCase()
  );
  return (stagingEnabled || mirrorEnabled || labDeploy) && Boolean(cfg.url && cfg.serviceRoleKey);
}

function observationRow(event: HobeliscoObservationEvent) {
  return {
    id: event.id,
    observed_at: event.observedAt,
    persisted_at: event.persistedAt ?? new Date().toISOString(),
    schema_version: event.schemaVersion,
    environment: event.environment,
    cooperative_id: event.cooperativeId,
    source: event.source,
    sensor: event.sensor,
    event_type: event.eventType,
    severity: event.severity,
    actor_type: event.actorType,
    actor_id_hash: event.actorIdHash,
    request_id: event.requestId,
    correlation_id: event.correlationId,
    endpoint: event.endpoint,
    operation: event.operation,
    outcome: event.outcome,
    fingerprint: event.fingerprint,
    metadata: event.metadata,
  };
}

function incidentRow(incident: HobeliscoIncidentV2) {
  return {
    id: incident.incidentId,
    schema_version: "2.0",
    environment: incident.environment,
    cooperative_id: incident.cooperativeId,
    severity: incident.severity,
    status: incident.status,
    confidence: incident.confidence,
    signals_count: incident.signalsCount,
    fingerprint: incident.fingerprint,
    context: incident.context,
    explanation: incident.explanation,
    updated_at: incident.updatedAt,
  };
}

export class SupabaseStagingPersistence implements HobeliscoPersistence {
  readonly mode = "supabase_staging" as const;
  readonly configured: boolean;
  readonly connectionStatus: "OK" | "NOT_CONFIGURED" | "ERROR";
  private client: SupabaseClient | null = null;
  private fallback: InMemoryPersistence;
  private lastError?: string;
  private observationIdsSeen = new Set<string>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.configured = isStagingPersistenceConfigured(env);
    this.fallback = new InMemoryPersistence();

    if (this.configured) {
      const cfg = readStagingConfig(env);
      try {
        this.client = createStagingSupabaseClient(cfg.url!, cfg.serviceRoleKey!);
        this.connectionStatus = "OK";
      } catch (e) {
        this.connectionStatus = "ERROR";
        this.lastError = String(e);
        this.client = null;
      }
    } else {
      this.connectionStatus = "NOT_CONFIGURED";
    }
  }

  private notConfiguredResult(): PersistenceResult {
    return { ok: false, error: STAGING_CONNECTION_NOT_CONFIGURED };
  }

  async saveObservation(event: HobeliscoObservationEvent): Promise<PersistenceResult> {
    if (this.observationIdsSeen.has(event.id)) {
      return { ok: true, duplicate: true };
    }

    const persisted = { ...event, persistedAt: new Date().toISOString() };
    await this.fallback.saveObservation(persisted);

    if (!this.configured || !this.client) {
      return this.notConfiguredResult();
    }

    const { error } = await this.client
      .from("hb_hobelisco_observations")
      .upsert(observationRow(persisted), { onConflict: "id" });

    if (error) {
      this.lastError = error.message;
      return { ok: false, error: error.message };
    }

    this.observationIdsSeen.add(event.id);
    return { ok: true };
  }

  async getObservation(id: string): Promise<HobeliscoObservationEvent | null> {
    return this.fallback.getObservation(id);
  }

  async listObservations(filter?: { cooperativeId?: string }): Promise<HobeliscoObservationEvent[]> {
    if (!this.client) return this.fallback.listObservations(filter);

    let query = this.client.from("hb_hobelisco_observations").select("*").limit(200);
    if (filter?.cooperativeId) {
      query = query.eq("cooperative_id", filter.cooperativeId);
    }
    const { data, error } = await query;
    if (error || !data) return this.fallback.listObservations(filter);

    return data.map((row) => ({
      id: row.id,
      timestamp: row.observed_at,
      observedAt: row.observed_at,
      persistedAt: row.persisted_at,
      environment: row.environment,
      source: row.source,
      sensor: row.sensor,
      eventType: row.event_type,
      severity: row.severity,
      cooperativeId: row.cooperative_id,
      actorType: row.actor_type ?? "unknown",
      actorIdHash: row.actor_id_hash,
      requestId: row.request_id,
      correlationId: row.correlation_id,
      endpoint: row.endpoint,
      operation: row.operation,
      outcome: row.outcome,
      metadata: row.metadata ?? {},
      fingerprint: row.fingerprint,
      schemaVersion: row.schema_version,
    }));
  }

  async saveIncident(incident: HobeliscoIncidentV2): Promise<PersistenceResult> {
    await this.fallback.saveIncident(incident);
    if (!this.configured || !this.client) return this.notConfiguredResult();

    const { error } = await this.client
      .from("hb_hobelisco_incidents")
      .upsert(incidentRow(incident), { onConflict: "id" });

    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async getIncident(id: string): Promise<HobeliscoIncidentV2 | null> {
    return this.fallback.getIncident(id);
  }

  async listIncidents(filter?: { status?: string; limit?: number }): Promise<HobeliscoIncidentV2[]> {
    const limit = filter?.limit ?? 50;
    if (!this.client) return this.fallback.listIncidents(filter);

    let query = this.client.from("hb_hobelisco_incidents").select("*").order("updated_at", { ascending: false }).limit(limit);
    if (filter?.status) query = query.eq("status", filter.status);
    const { data, error } = await query;
    if (error || !data) return this.fallback.listIncidents(filter);

    return data.map((row) => ({
      incidentId: row.id,
      firstSeen: row.created_at,
      lastSeen: row.updated_at,
      environment: row.environment,
      cooperativeId: row.cooperative_id,
      severity: row.severity,
      status: row.status,
      confidence: Number(row.confidence),
      signalsCount: row.signals_count,
      fingerprint: row.fingerprint ?? "",
      context: row.context ?? {},
      explanation: row.explanation ?? "",
      relatedMemoryIds: [],
      relatedAntibodyIds: [],
      correlationLevel: row.status === "CONFIRMED" ? "CONFIRMED_INCIDENT" : "INCIDENT_CANDIDATE",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveMemoryEvent(event: MemoryEventRecord): Promise<PersistenceResult> {
    await this.fallback.saveMemoryEvent(event);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_memory").upsert({
      id: event.id,
      schema_version: event.schemaVersion,
      environment: event.environment,
      cooperative_id: event.cooperativeId,
      layer: event.layer,
      kind: event.kind,
      summary: event.summary,
      context: event.context,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async listMemoryEvents(cooperativeId?: string): Promise<MemoryEventRecord[]> {
    return this.fallback.listMemoryEvents(cooperativeId);
  }

  async saveThreatFingerprint(fp: ThreatFingerprint): Promise<PersistenceResult> {
    await this.fallback.saveThreatFingerprint(fp);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_threat_fingerprints").upsert({
      id: fp.fingerprint,
      schema_version: "2.0",
      environment: "STAGING",
      cooperative_id: fp.cooperativeCnpj ?? null,
      fingerprint: fp.fingerprint,
      sequence: fp.sequence,
      severity: fp.severity,
      metadata: {},
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async listThreatFingerprints(): Promise<ThreatFingerprint[]> {
    return this.fallback.listThreatFingerprints();
  }

  async saveAntibody(record: AntibodyCandidateRecord): Promise<PersistenceResult> {
    await this.fallback.saveAntibody(record);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_antibodies").upsert({
      id: record.id,
      schema_version: record.schemaVersion,
      environment: record.environment,
      cooperative_id: null,
      threat_pattern: record.threatPattern,
      rule_id: record.ruleId,
      state: record.state,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async saveLearningInsight(insight: LearningInsightRecord): Promise<PersistenceResult> {
    await this.fallback.saveLearningInsight(insight);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_learning").upsert({
      id: insight.id,
      schema_version: insight.schemaVersion,
      environment: insight.environment,
      cooperative_id: insight.cooperativeId,
      hypothesis: insight.hypothesis,
      state: insight.state,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async saveHeartbeat(record: HeartbeatRecord): Promise<PersistenceResult> {
    await this.fallback.saveHeartbeat(record);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_heartbeats").upsert({
      id: record.id,
      schema_version: record.schemaVersion,
      environment: record.environment,
      status: record.status,
      payload: record.payload,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async saveStateTransition(record: StateTransitionRecord): Promise<PersistenceResult> {
    await this.fallback.saveStateTransition(record);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_state").upsert({
      id: record.id,
      schema_version: "2.0",
      environment: record.environment,
      from_state: record.from,
      to_state: record.to,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async saveAuditEvent(event: AuditChainEvent): Promise<PersistenceResult> {
    await this.fallback.saveAuditEvent(event);
    if (!this.client) return this.notConfiguredResult();
    const { error } = await this.client.from("hb_hobelisco_audit").upsert({
      id: event.id,
      schema_version: "2.0",
      environment: "STAGING",
      kind: event.kind,
      payload: event.payload,
      event_hash: event.eventHash,
      previous_event_hash: event.previousEventHash,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async listAuditEvents(): Promise<AuditChainEvent[]> {
    return this.fallback.listAuditEvents();
  }

  stats(): Record<string, number> {
    return {
      ...this.fallback.stats(),
      stagingConfigured: this.configured ? 1 : 0,
      stagingError: this.lastError ? 1 : 0,
    };
  }

  getFallback(): InMemoryPersistence {
    return this.fallback;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured) return { ok: false, error: STAGING_CONNECTION_NOT_CONFIGURED };
    if (!this.client) return { ok: false, error: this.lastError ?? "client_init_failed" };
    const { error } = await this.client.from("hb_hobelisco_observations").select("id").limit(1);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
}

export function createHobeliscoPersistence(
  env: NodeJS.ProcessEnv = process.env
): HobeliscoPersistence {
  const environment = (env.HOBELISCO_ENVIRONMENT ?? "").toUpperCase();
  if (environment === "STAGING" || isStagingPersistenceConfigured(env)) {
    return new SupabaseStagingPersistence(env);
  }
  return new InMemoryPersistence();
}

export { getInMemoryPersistence, resetInMemoryPersistence } from "./InMemoryPersistence";
