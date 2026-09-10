/** HobeliscoObserver V2 — orquestrador observe-only */

import { loadHobeliscoV2Flags } from "../config";
import {
  getEnvironmentBehavior,
  resolveHobeliscoEnvironment,
  validateEnvironmentBootstrap,
} from "../environment/HobeliscoEnvironment";
import { isHobeliscoBoundaryClearForOperation } from "@/lib/lab/hobeliscoLabBoundary";
import { createHobeliscoPersistence } from "../persistence/SupabaseStagingPersistence";
import { resetInMemoryPersistence } from "../persistence/InMemoryPersistence";
import type { HobeliscoPersistence } from "../persistence/HobeliscoPersistence";
import { ObservationPipeline } from "../observation/ObservationPipeline";
import { bridgeSensorSignals } from "../observation/SensorBridge";
import { emitHeartbeatV2 } from "../observer/HeartbeatV2";
import { computeSelfWatchV2 } from "../observer/SelfWatchV2";

export type ObserverStartResult =
  | { started: true; environment: string; mode: string }
  | { started: false; reason: string };

export class HobeliscoObserver {
  readonly environment = resolveHobeliscoEnvironment();
  readonly flags = loadHobeliscoV2Flags();
  readonly bootstrap = validateEnvironmentBootstrap();
  readonly persistence: HobeliscoPersistence;
  readonly pipeline: ObservationPipeline;
  private running = false;

  constructor(env: NodeJS.ProcessEnv = process.env, persistence?: HobeliscoPersistence) {
    this.persistence = persistence ?? createHobeliscoPersistence(env);
    this.pipeline = new ObservationPipeline(this.persistence, resolveHobeliscoEnvironment(env));
  }

  canStart(env: NodeJS.ProcessEnv = process.env): ObserverStartResult {
    const environment = resolveHobeliscoEnvironment(env);
    const flags = loadHobeliscoV2Flags(env);
    const behavior = getEnvironmentBehavior(environment);
    const bootstrap = validateEnvironmentBootstrap(env);

    if (environment === "PRODUCTION") {
      return { started: false, reason: "OBSERVER_DISABLED" };
    }

    if (!isHobeliscoBoundaryClearForOperation(env)) {
      return { started: false, reason: "LAB_BOUNDARY_BLOCKED" };
    }

    if (!flags.v2Enabled) {
      return { started: false, reason: "V2_DISABLED" };
    }

    if (environment === "STAGING" && !flags.observeOnly) {
      return { started: false, reason: "OBSERVE_ONLY_REQUIRED" };
    }

    if (bootstrap.safeMode) {
      return { started: false, reason: "SAFE_MODE" };
    }

    if (!behavior.observerEnabled) {
      return { started: false, reason: "OBSERVER_DISABLED" };
    }

    return { started: true, environment, mode: "observe-only" };
  }

  start(env: NodeJS.ProcessEnv = process.env): ObserverStartResult {
    const check = this.canStart(env);
    if (!check.started) return check;
    this.running = true;
    this.pipeline.audit.append("observer_start", { environment: this.environment });
    return check;
  }

  stop(): void {
    this.running = false;
    this.pipeline.audit.append("observer_stop", {});
  }

  isRunning(): boolean {
    return this.running;
  }

  async observeSensors(context?: Parameters<typeof bridgeSensorSignals>[1]): Promise<number> {
    if (!this.running) return 0;
    const events = bridgeSensorSignals(this.environment, context);
    let count = 0;
    for (const e of events) {
      const r = await this.pipeline.observe({
        environment: e.environment,
        source: e.source,
        sensor: e.sensor,
        eventType: e.eventType,
        cooperativeId: e.cooperativeId,
        metadata: e.metadata,
        id: e.id,
        timestamp: e.timestamp,
      });
      if (r.accepted) count += 1;
    }
    return count;
  }

  heartbeat() {
    const metrics = this.pipeline.getMetrics();
    const selfWatch = computeSelfWatchV2({
      persistence: this.persistence,
      pipelineMetrics: metrics,
      environment: this.environment,
      running: this.running,
    });
    return emitHeartbeatV2({
      environment: this.environment,
      persistenceOk: this.persistence.connectionStatus === "OK" || this.persistence.mode === "memory",
      selfWatch,
      metrics,
    });
  }

  getMetrics() {
    return this.pipeline.getMetrics();
  }
}

export function createLabObserver(resetPersistence = true): HobeliscoObserver {
  if (resetPersistence) resetInMemoryPersistence();
  process.env.HOBELISCO_ENVIRONMENT = "LAB";
  process.env.HB_HOBELISCO_V2_ENABLED = "true";
  return new HobeliscoObserver({ ...process.env, HOBELISCO_ENVIRONMENT: "LAB", HB_HOBELISCO_V2_ENABLED: "true" });
}

export function createStagingObserver(env: NodeJS.ProcessEnv): HobeliscoObserver {
  return new HobeliscoObserver({
    ...env,
    HOBELISCO_ENVIRONMENT: "STAGING",
    HB_HOBELISCO_V2_ENABLED: "true",
    HB_HOBELISCO_OBSERVE_ONLY: "true",
  });
}

export function createProductionTripwireObserver(): HobeliscoObserver {
  return new HobeliscoObserver({
    ...process.env,
    HOBELISCO_ENVIRONMENT: "PRODUCTION",
    HB_HOBELISCO_V2_ENABLED: "true",
  });
}
