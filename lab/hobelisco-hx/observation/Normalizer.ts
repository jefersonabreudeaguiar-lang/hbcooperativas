/** Normalizer — sinais brutos → HobeliscoObservationEvent */

import { createHash, randomBytes } from "crypto";
import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import type { SensorKind, SensorSignal } from "../types";
import { buildThreatFingerprint } from "../threat/ThreatClassifier";
import { sanitizeRawMetadata } from "./ObservationSanitizer";
import { OBSERVATION_SCHEMA_VERSION, type HobeliscoObservationEvent, type ObservationSeverity } from "./types";

export interface RawObservationInput {
  environment: HobeliscoEnvironment;
  source: string;
  sensor: SensorKind;
  eventType: string;
  severity?: ObservationSeverity;
  cooperativeId?: string | null;
  actorType?: HobeliscoObservationEvent["actorType"];
  actorId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  endpoint?: string | null;
  operation?: string | null;
  outcome?: HobeliscoObservationEvent["outcome"];
  metadata?: Record<string, unknown>;
  timestamp?: string;
  id?: string;
}

function severityFromSignal(level: SensorSignal["level"]): ObservationSeverity {
  if (level === "CRIT") return "critical";
  if (level === "WARN") return "medium";
  if (level === "OK") return "info";
  return "low";
}

export function normalizeRawObservation(input: RawObservationInput): HobeliscoObservationEvent {
  const at = input.timestamp ?? new Date().toISOString();
  const metadata = sanitizeRawMetadata(input.metadata ?? {});
  const id = input.id ?? `obs_${Date.now()}_${randomBytes(4).toString("hex")}`;

  const fp = buildThreatFingerprint({
    sequence: [input.sensor, input.eventType, input.endpoint ?? "", input.operation ?? ""],
    endpoint: input.endpoint ?? undefined,
    cooperativeCnpj: input.cooperativeId ?? undefined,
  });

  return {
    id,
    timestamp: at,
    observedAt: at,
    environment: input.environment,
    source: input.source,
    sensor: input.sensor,
    eventType: input.eventType,
    severity: input.severity ?? "medium",
    cooperativeId: input.cooperativeId ?? null,
    actorType: input.actorType ?? "unknown",
    actorIdHash: input.actorId ? hashActor(input.actorId) : null,
    requestId: input.requestId ?? null,
    correlationId: input.correlationId ?? null,
    endpoint: input.endpoint ?? null,
    operation: input.operation ?? null,
    outcome: input.outcome ?? "unknown",
    metadata,
    fingerprint: fp,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
  };
}

export function normalizeSensorSignal(
  signal: SensorSignal,
  environment: HobeliscoEnvironment,
  extra?: Partial<RawObservationInput>
): HobeliscoObservationEvent {
  return normalizeRawObservation({
    environment,
    source: "sensor_bridge",
    sensor: signal.sensor,
    eventType: signal.level === "OK" ? "sensor_ok" : "sensor_anomaly",
    severity: severityFromSignal(signal.level),
    metadata: { message: signal.message, ...(signal.metadata ?? {}) },
    timestamp: signal.observedAt,
    ...extra,
  });
}

function hashActor(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function detectClockSkew(sourceTs: string, observedAt: string): { skewMs: number; suspicious: boolean } {
  const skewMs = new Date(observedAt).getTime() - new Date(sourceTs).getTime();
  return { skewMs, suspicious: Math.abs(skewMs) > 300_000 };
}
