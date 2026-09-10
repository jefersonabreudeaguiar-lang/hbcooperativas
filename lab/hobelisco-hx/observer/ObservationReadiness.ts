/** Observation Readiness Score — complemento ao Vitality V1 */

import type { V2Metrics } from "../observation/types";

export interface ObservationReadinessScore {
  overall: number;
  dimensions: {
    SENSOR_COVERAGE: number;
    PERSISTENCE: number;
    OBSERVATION_INTEGRITY: number;
    MEMORY_CONTINUITY: number;
    BOUNDARY: number;
    SELF_WATCH: number;
  };
  computedAt: string;
}

export function computeObservationReadiness(input: {
  sensorCount: number;
  persistenceConfigured: boolean;
  persistenceMode: string;
  metrics: V2Metrics;
  selfWatchOk: boolean;
  v1RegressionPass: boolean;
}): ObservationReadinessScore {
  const sensorCoverage = Math.min(100, Math.round((input.sensorCount / 10) * 100));
  const persistence =
    input.persistenceMode === "memory"
      ? 85
      : input.persistenceConfigured
        ? 95
        : 55;
  const integrity = Math.round(input.metrics.observationIntegrityRate * 100) || 0;
  const memory = input.metrics.memoryRecallFailures === 0 ? 88 : 50;
  const boundary =
    input.metrics.boundaryBlocks >= 0 && input.metrics.productionTripwires >= 0 ? 98 : 40;
  const selfWatch = input.selfWatchOk ? 90 : 45;

  const overall = Math.round(
    (sensorCoverage + persistence + integrity + memory + boundary + selfWatch) / 6
  );

  return {
    overall: input.v1RegressionPass ? overall : Math.min(overall, 49),
    dimensions: {
      SENSOR_COVERAGE: sensorCoverage,
      PERSISTENCE: persistence,
      OBSERVATION_INTEGRITY: integrity,
      MEMORY_CONTINUITY: memory,
      BOUNDARY: boundary,
      SELF_WATCH: selfWatch,
    },
    computedAt: new Date().toISOString(),
  };
}

export type V2Verdict = "V2-GREEN" | "V2-AMBER" | "V2-RED";

export function computeV2Verdict(input: {
  testsFailed: number;
  criticalFailed: number;
  v1RegressionPass: boolean;
  productionTripwirePass: boolean;
  financialMutationCount: number;
  secretPersisted: boolean;
  cooperativeLeak: boolean;
}): V2Verdict {
  if (
    input.financialMutationCount > 0 ||
    input.secretPersisted ||
    input.cooperativeLeak ||
    !input.productionTripwirePass
  ) {
    return "V2-RED";
  }
  if (!input.v1RegressionPass || input.criticalFailed > 0) return "V2-RED";
  if (input.testsFailed > 0) return "V2-AMBER";
  return "V2-GREEN";
}
