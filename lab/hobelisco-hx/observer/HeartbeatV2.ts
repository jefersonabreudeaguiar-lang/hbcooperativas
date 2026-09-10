/** Heartbeat V2 — verifica pipeline observe-only */

import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import type { V2Metrics } from "../observation/types";
import type { SelfWatchV2Snapshot } from "./SelfWatchV2";

export type HeartbeatV2Status = "HEALTHY" | "DEGRADED" | "SAFE_MODE";

export interface HeartbeatV2 {
  status: HeartbeatV2Status;
  environment: HobeliscoEnvironment;
  lines: string[];
  checks: Record<string, boolean>;
  emittedAt: string;
}

export function emitHeartbeatV2(input: {
  environment: HobeliscoEnvironment;
  persistenceOk: boolean;
  selfWatch: SelfWatchV2Snapshot;
  metrics: V2Metrics;
}): HeartbeatV2 {
  const checks = {
    core: true,
    sensors: input.selfWatch.sensorHealthOk,
    persistence: input.persistenceOk && input.selfWatch.persistenceLagMs < 5000,
    memory: input.selfWatch.memoryContinuityOk,
    audit: input.metrics.auditIntegrityFailures === 0,
    environment: input.environment !== "PRODUCTION",
    boundary: input.metrics.boundaryBlocks >= 0,
    observationPipeline: input.selfWatch.observationPipelineOk,
  };

  let status: HeartbeatV2Status = "HEALTHY";
  if (input.environment === "PRODUCTION") status = "SAFE_MODE";
  else if (!input.persistenceOk || !checks.persistence) status = "DEGRADED";
  else if (!input.selfWatch.observationPipelineOk) status = "DEGRADED";
  else if (input.metrics.observationIntegrityRate < 0.9 && input.metrics.observationsReceived > 0) {
    status = "DEGRADED";
  }

  const lines = [
    `ENV ${input.environment}`,
    `STATUS ${status}`,
    `INTEGRITY ${Math.round(input.metrics.observationIntegrityRate * 100)}%`,
    `RECEIVED ${input.metrics.observationsReceived}`,
    `PERSISTED ${input.metrics.observationsPersisted}`,
    `DROPPED ${input.metrics.observationsDropped}`,
    input.selfWatch.summary,
  ];

  return { status, environment: input.environment, lines, checks, emittedAt: new Date().toISOString() };
}
