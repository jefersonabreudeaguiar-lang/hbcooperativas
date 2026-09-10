/** Sensor Bridge — V1 sensores → observações V2 (não decide) */

import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { runAllSensors } from "../sensors/index";
import type { SensorKind, SensorSignal } from "../types";
import { normalizeRawObservation, normalizeSensorSignal } from "./Normalizer";
import type { HobeliscoObservationEvent } from "./types";

const ALL_SENSORS: SensorKind[] = [
  "AUTH",
  "API",
  "SYNC",
  "DATABASE",
  "PERFORMANCE",
  "INTEGRITY",
  "HB_CREDIT",
  "CACHE",
  "DEVICE",
  "BEHAVIOR",
];

export function bridgeSensorSignals(
  environment: HobeliscoEnvironment,
  context?: Parameters<typeof runAllSensors>[0]
): HobeliscoObservationEvent[] {
  const signals = runAllSensors(context);
  return signals.map((s) => normalizeSensorSignal(s, environment));
}

export function bridgeAuthObservation(
  environment: HobeliscoEnvironment,
  input: {
    eventType: "auth_success" | "auth_failure" | "access_denied" | "session_expired" | "role_mismatch";
    cooperativeId?: string | null;
    actorId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }
): HobeliscoObservationEvent {
  return normalizeRawObservation({
    environment,
    source: "auth_observer",
    sensor: "AUTH",
    eventType: input.eventType,
    severity: input.eventType === "auth_success" ? "info" : "medium",
    cooperativeId: input.cooperativeId,
    actorId: input.actorId,
    requestId: input.requestId,
    outcome: input.eventType === "auth_success" ? "success" : "failure",
    metadata: input.metadata,
  });
}

export function bridgeApiObservation(
  environment: HobeliscoEnvironment,
  input: {
    endpoint: string;
    operation: string;
    status: number;
    latencyMs: number;
    requestId?: string;
    correlationId?: string;
    cooperativeId?: string | null;
  }
): HobeliscoObservationEvent {
  return normalizeRawObservation({
    environment,
    source: "api_observer",
    sensor: "API",
    eventType: input.status >= 400 ? "api_error" : "api_request",
    severity: input.status >= 500 ? "high" : input.status >= 400 ? "medium" : "info",
    endpoint: input.endpoint,
    operation: input.operation,
    requestId: input.requestId ?? null,
    correlationId: input.correlationId ?? null,
    cooperativeId: input.cooperativeId,
    outcome: input.status < 400 ? "success" : "failure",
    metadata: { status: input.status, latencyMs: input.latencyMs },
  });
}

export function bridgeSyncObservation(
  environment: HobeliscoEnvironment,
  input: {
    eventType: string;
    cooperativeId?: string | null;
    durationMs?: number;
    payloadSize?: number;
    version?: string;
    outcome: HobeliscoObservationEvent["outcome"];
  }
): HobeliscoObservationEvent {
  return normalizeRawObservation({
    environment,
    source: "sync_observer",
    sensor: "SYNC",
    eventType: input.eventType,
    cooperativeId: input.cooperativeId,
    outcome: input.outcome,
    metadata: {
      durationMs: input.durationMs ?? 0,
      payloadSize: input.payloadSize ?? 0,
      version: input.version ?? "unknown",
    },
  });
}

export function bridgeDatabaseObservation(
  environment: HobeliscoEnvironment,
  input: {
    eventType: "db_latency" | "db_read" | "db_error";
    latencyMs?: number;
    cooperativeId?: string | null;
  }
): HobeliscoObservationEvent {
  return normalizeRawObservation({
    environment,
    source: "database_observer",
    sensor: "DATABASE",
    eventType: input.eventType,
    cooperativeId: input.cooperativeId,
    severity: input.eventType === "db_error" ? "high" : "info",
    metadata: { latencyMs: input.latencyMs ?? 0, readOnly: true },
  });
}

export function bridgeHbCreditObservation(
  environment: HobeliscoEnvironment,
    input: {
    eventType: string;
    cooperativeId?: string | null;
    metadata?: Record<string, unknown>;
    severity?: HobeliscoObservationEvent["severity"];
  }
): HobeliscoObservationEvent {
  const eventType = input.eventType;
  const defaultSeverity =
    eventType.includes("over_limit") ||
    eventType.includes("invalid_") ||
    eventType.includes("probe_execution_error")
      ? "critical"
      : eventType.includes("divergence")
        ? "medium"
        : "info";

  return normalizeRawObservation({
    environment,
    source: "hb_credit_observer",
    sensor: "HB_CREDIT",
    eventType,
    cooperativeId: input.cooperativeId,
    severity: input.severity ?? defaultSeverity,
    outcome: "unknown",
    metadata: { observeOnly: true, ...(input.metadata ?? {}) },
  });
}

export function listBridgeSensors(): SensorKind[] {
  return ALL_SENSORS;
}

export type { SensorSignal };
