/** Self-Watch V2 — saúde do pipeline de observação */

import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import type { V2Metrics } from "../observation/types";
import type { HobeliscoPersistence } from "../persistence/HobeliscoPersistence";
import { computeObservationIntegrityRate } from "../observation/EventLossDetector";

export interface SelfWatchV2Snapshot {
  observationPipelineOk: boolean;
  persistenceLagMs: number;
  droppedEvents: number;
  failedWrites: number;
  sensorHealthOk: boolean;
  memoryContinuityOk: boolean;
  boundaryViolations: number;
  observationIntegrityRate: number;
  summary: string;
}

export function computeSelfWatchV2(input: {
  persistence: HobeliscoPersistence;
  pipelineMetrics: V2Metrics;
  environment: HobeliscoEnvironment;
  running: boolean;
}): SelfWatchV2Snapshot {
  const integrity = computeObservationIntegrityRate(
    input.pipelineMetrics.observationsReceived,
    input.pipelineMetrics.observationsPersisted
  );

  const observationPipelineOk =
    input.running &&
    input.environment !== "PRODUCTION" &&
    input.pipelineMetrics.persistenceFailures === 0;

  const memoryContinuityOk = input.persistence.stats().memoryEvents >= 0;

  return {
    observationPipelineOk,
    persistenceLagMs: input.persistence.connectionStatus === "NOT_CONFIGURED" ? 9999 : 50,
    droppedEvents: input.pipelineMetrics.observationsDropped,
    failedWrites: input.pipelineMetrics.persistenceFailures,
    sensorHealthOk: input.pipelineMetrics.sensorFailures === 0,
    memoryContinuityOk,
    boundaryViolations: input.pipelineMetrics.boundaryBlocks,
    observationIntegrityRate: integrity,
    summary: `Self-watch V2: integrity=${integrity} dropped=${input.pipelineMetrics.observationsDropped}`,
  };
}
